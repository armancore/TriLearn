const crypto = require('crypto')
const QRCode = require('qrcode')
const { getReadyRedisClient } = require('../../utils/redis')
const {
  QR_VALIDITY_MINUTES,
  prisma,
  getDayRange,
  getOwnedSubject,
  createSignedQrPayload,
  parseQrPayload,
  hashQrPayload,
  getDailyGateWindows,
  normalizeSemesterList,
  getEligibleGateAttendanceForStudent,
  upsertPresentAttendanceForRoutines,
  getStudentByIdCardQr,
  getStudentByRollNumber,
  recordAuditLog
} = require('./shared')

const getStudentIdQrReplayKey = ({ studentId, qrData }) => {
  if (!studentId || typeof qrData !== 'string' || !qrData.trim()) {
    return null
  }

  const qrHash = crypto.createHash('sha256').update(qrData).digest('hex')
  return `qr-used:${studentId}:${qrHash}`
}

const reserveStudentIdQrScan = async ({ student, qrData, parsedQr }) => {
  const key = getStudentIdQrReplayKey({ studentId: student.id, qrData })
  if (!key || !parsedQr?.expiresAt) {
    return { reserved: false }
  }

  const expiresAt = new Date(parsedQr.expiresAt)
  const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000))

  if (Number.isNaN(expiresAt.getTime()) || ttlSeconds <= 0) {
    return { reserved: false }
  }

  try {
    const redis = await getReadyRedisClient({ context: 'student ID QR replay guard' })
    if (!redis) {
      return { reserved: false }
    }

    const result = await redis.set(key, '1', { EX: ttlSeconds, NX: true })
    if (result !== 'OK') {
      return { error: { status: 409, message: 'Student ID QR code has already been used for this scan window' } }
    }

    return { reserved: true }
  } catch {
    return { reserved: false }
  }
}

const generateQR = async (req, res) => {
  try {
    const { subjectId, date, validMinutes } = req.body
    const parsedValidMinutes = Number(validMinutes)
    const qrValidityMinutes = Number.isInteger(parsedValidMinutes) && parsedValidMinutes >= 1 && parsedValidMinutes <= 15
      ? parsedValidMinutes
      : QR_VALIDITY_MINUTES

    if (date !== undefined && date !== null && date !== '') {
      const isIsoDateString = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date)
      const parsedDate = new Date(date)
      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000))

      if (!isIsoDateString || Number.isNaN(parsedDate.getTime()) || parsedDate < oneDayAgo || parsedDate > now) {
        return res.status(400).json({ message: 'Please provide a valid attendance date.' })
      }
    }

    const access = await getOwnedSubject(subjectId, req)
    if (access.error) return res.status(access.error.status).json({ message: access.error.message })

    const instructorId = access.instructor?.id || access.subject.instructorId
    if (!instructorId) return res.status(400).json({ message: 'Assign an instructor to this subject before managing attendance' })

    const qrData = createSignedQrPayload({
      subjectId,
      instructorId,
      date: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (qrValidityMinutes * 60 * 1000)).toISOString()
    })

    const qrCode = await QRCode.toDataURL(qrData)
    res.json({
      message: 'QR Code generated successfully!',
      qrCode,
      expiresIn: `${qrValidityMinutes} minutes`,
      subjectId,
      instructorId
    })
  } catch (error) {
    res.internalError(error)
  }
}

const markAttendanceQR = async (req, res) => {
  try {
    const { qrData } = req.body
    const student = req.student
    if (!student) return res.status(403).json({ message: 'Student profile not found' })

    const parsedQR = parseQrPayload(qrData)
    if (!parsedQR) return res.status(400).json({ message: 'Invalid QR code' })
    const expiresAt = new Date(parsedQR.expiresAt)
    const now = new Date()
    if (now > expiresAt) return res.status(400).json({ message: 'QR code has expired' })

    const qrHash = crypto.createHash('sha256').update(qrData).digest('hex')
    const qrReplayKey = `qr-used:${student.id}:${qrHash}`
    let redis = null
    try {
      redis = await getReadyRedisClient({ context: 'QR attendance replay guard' })
      if (redis && await redis.exists(qrReplayKey)) {
        return res.status(409).json({ message: 'Attendance already recorded for this QR code' })
      }
    } catch {
      redis = null
    }

    const { subjectId, instructorId } = parsedQR
    const subject = await prisma.subject.findUnique({ where: { id: subjectId } })
    if (!subject) return res.status(404).json({ message: 'Subject not found' })

    const enrollment = await prisma.subjectEnrollment.findUnique({
      where: { subjectId_studentId: { subjectId, studentId: student.id } }
    })
    if (!enrollment) return res.status(403).json({ message: 'You are not eligible to mark attendance for this subject' })

    const todayRange = getDayRange()
    const existingAttendance = await prisma.attendance.findUnique({
      where: {
        studentId_subjectId_date: {
          studentId: student.id,
          subjectId,
          date: todayRange.start
        }
      }
    })

    if (existingAttendance) {
      return res.status(409).json({
        message: 'Attendance has already been recorded for this subject today.'
      })
    }

    const attendance = await prisma.attendance.create({
      data: {
        studentId: student.id,
        subjectId,
        instructorId,
        status: 'PRESENT',
        qrCode: hashQrPayload(qrData),
        date: todayRange.start
      },
      include: {
        subject: { select: { name: true, code: true } },
        student: { include: { user: { select: { name: true } } } }
      }
    })

    if (redis) {
      try {
        const remainingValiditySeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000))
        await redis.set(qrReplayKey, '1', { EX: remainingValiditySeconds })
      } catch {
        // Redis replay tracking is best-effort; attendance should not fail after the database write.
      }
    }

    res.status(201).json({
      message: 'Attendance marked successfully!',
      attendance: {
        id: attendance.id,
        student: attendance.student.user.name,
        subject: attendance.subject.name,
        status: attendance.status,
        date: attendance.date
      }
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'ATTENDANCE_MARKED_BY_QR',
      entityType: 'Attendance',
      entityId: attendance.id,
      metadata: { subjectId, attendanceDate: todayRange.start }
    })
  } catch (error) {
    res.internalError(error)
  }
}

const markDailyAttendanceQR = async (req, res) => {
  try {
    const { qrData } = req.body
    const student = req.student
    if (!student) return res.status(403).json({ message: 'Student profile not found' })

    const parsedQR = parseQrPayload(qrData)
    if (!parsedQR || parsedQR.type !== 'GATE_STUDENT_QR' || !Array.isArray(parsedQR.windowIds)) {
      return res.status(400).json({ message: 'Invalid gate attendance QR code' })
    }

    const now = new Date()
    if (new Date(parsedQR.expiresAt) <= now) return res.status(400).json({ message: 'This gate QR has already rotated. Please scan the latest QR.' })

    const gateDay = await getDailyGateWindows(now)
    if (gateDay.holiday) return res.status(400).json({ message: `Today is marked as a holiday: ${gateDay.holiday.title}` })
    if (!gateDay.active.length) return res.status(400).json({ message: 'The scan time has passed for now. Please wait for the next active window.' })

    const activeMap = new Map(gateDay.active.map((window) => [window.id, window]))
    const eligibleWindows = parsedQR.windowIds.map((windowId) => activeMap.get(windowId)).filter(Boolean)
    if (!eligibleWindows.length) return res.status(400).json({ message: 'This gate QR is not valid for the current routine window.' })

    const allowedSemesters = normalizeSemesterList([...(parsedQR.allowedSemesters || []), ...eligibleWindows.flatMap((window) => window.allowedSemesters)])
    if (!allowedSemesters.includes(student.semester)) return res.status(403).json({ message: 'Your semester is not allowed to scan this Student QR right now.' })

    const eligibility = await getEligibleGateAttendanceForStudent(student, now)
    if (eligibility.error) return res.status(eligibility.error.status).json({ message: eligibility.error.message })

    const result = await upsertPresentAttendanceForRoutines({
      student,
      routines: eligibility.routines,
      attendanceDate: gateDay.dayRange,
      qrData,
      actorRole: req.user.role,
      actorId: req.user.id
    })
    if (result.error) return res.status(result.error.status).json({ message: result.error.message })

    res.status(201).json({
      message: `Attendance marked for ${result.markedSubjects.length} class${result.markedSubjects.length > 1 ? 'es' : ''}.`,
      markedSubjects: result.markedSubjects,
      date: gateDay.dayRange.start,
      expiresAt: parsedQR.expiresAt
    })
  } catch (error) {
    res.internalError(error)
  }
}

const getLiveGateAttendanceQrPayload = async (req) => {
  const now = new Date()
  const windows = await getDailyGateWindows(now)

  if (windows.holiday) {
    return {
      active: false,
      holiday: true,
      dayOfWeek: windows.dayOfWeek,
      serverTime: now.toISOString(),
      holidayInfo: {
        id: windows.holiday.id,
        title: windows.holiday.title,
        description: windows.holiday.description,
        date: windows.holiday.date.toISOString()
      },
      nextWindow: null
    }
  }

  if (!windows.active.length) {
    return {
      active: false,
      dayOfWeek: windows.dayOfWeek,
      serverTime: now.toISOString(),
      timePassed: windows.windows.length > 0 && !windows.nextWindow,
      nextWindow: windows.nextWindow ? {
        id: windows.nextWindow.id,
        startTime: windows.nextWindow.startTime,
        endTime: windows.nextWindow.endTime,
        startsAt: windows.nextWindow.startsAt.toISOString(),
        scanClosesAt: windows.nextWindow.endsAt.toISOString(),
        allowedSemesters: windows.nextWindow.allowedSemesters
      } : null
    }
  }

  const expiresAt = new Date(Math.min(now.getTime() + (60 * 1000), ...windows.active.map((window) => window.endsAt.getTime())))
  const allowedSemesters = normalizeSemesterList(windows.active.flatMap((window) => window.allowedSemesters))
  const qrData = createSignedQrPayload({
    type: 'GATE_STUDENT_QR',
    issuedBy: req.user.id,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    dayOfWeek: windows.dayOfWeek,
    windowIds: windows.active.map((window) => window.id),
    allowedSemesters
  })
  const qrCode = await QRCode.toDataURL(qrData)

  return {
    active: true,
    qrCode,
    qrData,
    dayOfWeek: windows.dayOfWeek,
    serverTime: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    refreshInSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
    allowedSemesters,
    periods: windows.active.map((window) => ({
      id: window.id,
      title: window.title,
      startTime: window.startTime,
      endTime: window.endTime,
      startsAt: window.startsAt.toISOString(),
      scanClosesAt: window.endsAt.toISOString(),
      allowedSemesters: window.allowedSemesters
    })),
    nextWindow: windows.nextWindow ? {
      id: windows.nextWindow.id,
      title: windows.nextWindow.title,
      startTime: windows.nextWindow.startTime,
      endTime: windows.nextWindow.endTime,
      startsAt: windows.nextWindow.startsAt.toISOString(),
      scanClosesAt: windows.nextWindow.endsAt.toISOString(),
      allowedSemesters: windows.nextWindow.allowedSemesters
    } : null
  }
}

const getLiveGateAttendanceQr = async (req, res) => {
  try {
    const payload = await getLiveGateAttendanceQrPayload(req)
    res.json(payload)
  } catch (error) {
    res.internalError(error)
  }
}

const generateDailyAttendanceQR = async (req, res) => {
  try {
    const payload = await getLiveGateAttendanceQrPayload(req)
    if (!payload.active) {
      return res.status(400).json({
        message: payload.nextWindow
          ? 'There is no active attendance period right now. Please wait for the next scheduled class window.'
          : 'No routine is scheduled for today.'
      })
    }

    res.json({ message: 'Rotating gate attendance QR generated successfully!', ...payload })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'DAILY_GATE_QR_GENERATED',
      entityType: 'Attendance',
      metadata: {
        windowIds: payload.periods.map((period) => period.id),
        allowedSemesters: payload.allowedSemesters,
        expiresAt: payload.expiresAt
      }
    })
  } catch (error) {
    res.internalError(error)
  }
}

const scanStudentIdAttendance = async (req, res) => {
  try {
    const { qrData, rollNumber, subjectId, attendanceDate } = req.body
    const { role } = req.user
    const scanned = rollNumber
      ? await getStudentByRollNumber(rollNumber)
      : await getStudentByIdCardQr(qrData)
    if (scanned.error) return res.status(scanned.error.status).json({ message: scanned.error.message })
    const { student, parsedQr } = scanned

    if (role === 'GATEKEEPER') {
      const eligibility = await getEligibleGateAttendanceForStudent(student, new Date())
      if (eligibility.error) return res.status(eligibility.error.status).json({ message: eligibility.error.message })

      const replayReservation = await reserveStudentIdQrScan({ student, qrData, parsedQr })
      if (replayReservation.error) {
        return res.status(replayReservation.error.status).json({ message: replayReservation.error.message })
      }

      const result = await upsertPresentAttendanceForRoutines({
        student,
        routines: eligibility.routines,
        attendanceDate: eligibility.gateDay.dayRange,
        qrData,
        actorRole: req.user.role,
        actorId: req.user.id
      })
      if (result.error) return res.status(result.error.status).json({ message: result.error.message })

      return res.status(201).json({
        message: `Attendance marked for ${student.user.name}.`,
        mode: 'GATE_WINDOW',
        student: {
          id: student.id,
          name: student.user.name,
          rollNumber: student.rollNumber,
          department: student.department,
          semester: student.semester,
          section: student.section
        },
        markedSubjects: result.markedSubjects,
        date: eligibility.gateDay.dayRange.start
      })
    }

    if (!subjectId) {
      return res.status(400).json({ message: 'subjectId is required for instructor/coordinator scans' })
    }

    const access = await getOwnedSubject(subjectId, req)
    if (access.error) return res.status(access.error.status).json({ message: access.error.message })

    const dayRange = getDayRange(attendanceDate || new Date())
    if (!dayRange) return res.status(400).json({ message: 'Please provide a valid attendance date.' })

    const enrollment = await prisma.subjectEnrollment.findUnique({
      where: { subjectId_studentId: { subjectId, studentId: student.id } }
    })
    if (!enrollment) return res.status(400).json({ message: 'This student is not enrolled in the selected subject.' })

    const instructorId = access.instructor?.id || access.subject.instructorId
    if (!instructorId) return res.status(400).json({ message: 'Assign an instructor to this subject before managing attendance.' })
    const qrCodeHash = hashQrPayload(qrData)

    const record = await prisma.attendance.upsert({
      where: {
        studentId_subjectId_date: {
          studentId: student.id,
          subjectId,
          date: dayRange.start
        }
      },
      update: { instructorId, status: 'PRESENT', qrCode: qrCodeHash },
      create: {
        studentId: student.id,
        subjectId,
        instructorId,
        status: 'PRESENT',
        qrCode: qrCodeHash,
        date: dayRange.start
      }
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'STAFF_STUDENT_ID_ATTENDANCE_MARKED',
      entityType: 'Attendance',
      metadata: { studentId: student.id, subjectId, attendanceId: record.id, date: dayRange.start }
    })

    return res.status(201).json({
      message: `Attendance marked for ${student.user.name} in ${access.subject.name}.`,
      mode: 'SUBJECT',
      student: {
        id: student.id,
        name: student.user.name,
        rollNumber: student.rollNumber,
        semester: student.semester,
        section: student.section
      },
      subject: {
        id: access.subject.id,
        name: access.subject.name,
        code: access.subject.code
      },
      date: dayRange.start
    })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = { generateQR, markAttendanceQR, markDailyAttendanceQR, getLiveGateAttendanceQr, generateDailyAttendanceQR, scanStudentIdAttendance }
