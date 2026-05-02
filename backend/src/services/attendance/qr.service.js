/* eslint-disable no-useless-catch */
const { createServiceResponder } = require('../../utils/serviceResult')
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
} = require('./shared.service')

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

    const reservationResult = await redis.set(key, '1', { EX: ttlSeconds, NX: true })
    if (reservationResult !== 'OK') {
      return { error: { status: 409, message: 'Student ID QR code has already been used for this scan window' } }
    }

    return { reserved: true }
  } catch {
    return { reserved: false }
  }
}

/**
 * Handles generate q r business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const generateQR = async (context, result = createServiceResponder()) => {
  try {
    const { subjectId, date, validMinutes } = context.body
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
        return result.withStatus(400, { message: 'Please provide a valid attendance date.' })
      }
    }

    const access = await getOwnedSubject(subjectId, context)
    if (access.error) return result.withStatus(access.error.status, { message: access.error.message })

    const instructorId = access.instructor?.id || access.subject.instructorId
    if (!instructorId) return result.withStatus(400, { message: 'Assign an instructor to this subject before managing attendance' })

    const qrData = createSignedQrPayload({
      subjectId,
      instructorId,
      date: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (qrValidityMinutes * 60 * 1000)).toISOString()
    })

    const qrCode = await QRCode.toDataURL(qrData)
    result.ok({
      message: 'QR Code generated successfully!',
      qrCode,
      expiresIn: `${qrValidityMinutes} minutes`,
      subjectId,
      instructorId
    })
  } catch (error) {
    throw error
  }
}

/**
 * Handles mark attendance q r business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const markAttendanceQR = async (context, result = createServiceResponder()) => {
  try {
    const { qrData } = context.body
    const student = context.student
    if (!student) return result.withStatus(403, { message: 'Student profile not found' })

    const parsedQR = parseQrPayload(qrData)
    if (!parsedQR) return result.withStatus(400, { message: 'Invalid QR code' })
    const expiresAt = new Date(parsedQR.expiresAt)
    const now = new Date()
    if (now > expiresAt) return result.withStatus(400, { message: 'QR code has expired' })

    const qrHash = crypto.createHash('sha256').update(qrData).digest('hex')
    const qrReplayKey = `qr-used:${student.id}:${qrHash}`
    let redis = null
    try {
      redis = await getReadyRedisClient({ context: 'QR attendance replay guard' })
      if (redis && await redis.exists(qrReplayKey)) {
        return result.withStatus(409, { message: 'Attendance already recorded for this QR code' })
      }
    } catch {
      redis = null
    }

    const { subjectId, instructorId } = parsedQR
    const subject = await prisma.subject.findUnique({ where: { id: subjectId } })
    if (!subject) return result.withStatus(404, { message: 'Subject not found' })

    const enrollment = await prisma.subjectEnrollment.findUnique({
      where: { subjectId_studentId: { subjectId, studentId: student.id } }
    })
    if (!enrollment) return result.withStatus(403, { message: 'You are not eligible to mark attendance for this subject' })

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
      return result.withStatus(409, {
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

    result.withStatus(201, {
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
      actorId: context.user.id,
      actorRole: context.user.role,
      action: 'ATTENDANCE_MARKED_BY_QR',
      entityType: 'Attendance',
      entityId: attendance.id,
      metadata: { subjectId, attendanceDate: todayRange.start }
    })
  } catch (error) {
    throw error
  }
}

/**
 * Handles mark daily attendance q r business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const markDailyAttendanceQR = async (context, result = createServiceResponder()) => {
  try {
    const { qrData } = context.body
    const student = context.student
    if (!student) return result.withStatus(403, { message: 'Student profile not found' })

    const parsedQR = parseQrPayload(qrData)
    if (!parsedQR || parsedQR.type !== 'GATE_STUDENT_QR' || !Array.isArray(parsedQR.windowIds)) {
      return result.withStatus(400, { message: 'Invalid gate attendance QR code' })
    }

    const now = new Date()
    if (new Date(parsedQR.expiresAt) <= now) return result.withStatus(400, { message: 'This gate QR has already rotated. Please scan the latest QR.' })

    const gateDay = await getDailyGateWindows(now)
    if (gateDay.holiday) return result.withStatus(400, { message: `Today is marked as a holiday: ${gateDay.holiday.title}` })
    if (!gateDay.active.length) return result.withStatus(400, { message: 'The scan time has passed for now. Please wait for the next active window.' })

    const activeMap = new Map(gateDay.active.map((window) => [window.id, window]))
    const eligibleWindows = parsedQR.windowIds.map((windowId) => activeMap.get(windowId)).filter(Boolean)
    if (!eligibleWindows.length) return result.withStatus(400, { message: 'This gate QR is not valid for the current routine window.' })

    const allowedSemesters = normalizeSemesterList([...(parsedQR.allowedSemesters || []), ...eligibleWindows.flatMap((window) => window.allowedSemesters)])
    if (!allowedSemesters.includes(student.semester)) return result.withStatus(403, { message: 'Your semester is not allowed to scan this Student QR right now.' })

    const eligibility = await getEligibleGateAttendanceForStudent(student, now)
    if (eligibility.error) return result.withStatus(eligibility.error.status, { message: eligibility.error.message })

    const attendanceResult = await upsertPresentAttendanceForRoutines({
      student,
      routines: eligibility.routines,
      attendanceDate: gateDay.dayRange,
      qrData,
      actorRole: context.user.role,
      actorId: context.user.id
    })
    if (attendanceResult.error) return result.withStatus(attendanceResult.error.status, { message: attendanceResult.error.message })

    result.withStatus(201, {
      message: `Attendance marked for ${attendanceResult.markedSubjects.length} class${attendanceResult.markedSubjects.length > 1 ? 'es' : ''}.`,
      markedSubjects: attendanceResult.markedSubjects,
      date: gateDay.dayRange.start,
      expiresAt: parsedQR.expiresAt
    })
  } catch (error) {
    throw error
  }
}

const getLiveGateAttendanceQrPayload = async (context) => {
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
    issuedBy: context.user.id,
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

/**
 * Handles get live gate attendance qr business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getLiveGateAttendanceQr = async (context, result = createServiceResponder()) => {
  try {
    const payload = await getLiveGateAttendanceQrPayload(context)
    result.ok(payload)
  } catch (error) {
    throw error
  }
}

/**
 * Handles generate daily attendance q r business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const generateDailyAttendanceQR = async (context, result = createServiceResponder()) => {
  try {
    const payload = await getLiveGateAttendanceQrPayload(context)
    if (!payload.active) {
      return result.withStatus(400, {
        message: payload.nextWindow
          ? 'There is no active attendance period right now. Please wait for the next scheduled class window.'
          : 'No routine is scheduled for today.'
      })
    }

    result.ok({ message: 'Rotating gate attendance QR generated successfully!', ...payload })

    await recordAuditLog({
      actorId: context.user.id,
      actorRole: context.user.role,
      action: 'DAILY_GATE_QR_GENERATED',
      entityType: 'Attendance',
      metadata: {
        windowIds: payload.periods.map((period) => period.id),
        allowedSemesters: payload.allowedSemesters,
        expiresAt: payload.expiresAt
      }
    })
  } catch (error) {
    throw error
  }
}

/**
 * Handles scan student id attendance business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const scanStudentIdAttendance = async (context, result = createServiceResponder()) => {
  try {
    const { qrData, rollNumber, subjectId, attendanceDate } = context.body
    const { role } = context.user
    const scanned = rollNumber
      ? await getStudentByRollNumber(rollNumber)
      : await getStudentByIdCardQr(qrData)
    if (scanned.error) return result.withStatus(scanned.error.status, { message: scanned.error.message })
    const { student, parsedQr } = scanned

    if (role === 'GATEKEEPER') {
      const eligibility = await getEligibleGateAttendanceForStudent(student, new Date())
      if (eligibility.error) return result.withStatus(eligibility.error.status, { message: eligibility.error.message })

      const replayReservation = await reserveStudentIdQrScan({ student, qrData, parsedQr })
      if (replayReservation.error) {
        return result.withStatus(replayReservation.error.status, { message: replayReservation.error.message })
      }

      const attendanceResult = await upsertPresentAttendanceForRoutines({
        student,
        routines: eligibility.routines,
        attendanceDate: eligibility.gateDay.dayRange,
        qrData,
        actorRole: context.user.role,
        actorId: context.user.id
      })
      if (attendanceResult.error) return result.withStatus(attendanceResult.error.status, { message: attendanceResult.error.message })

      return result.withStatus(201, {
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
      return result.withStatus(400, { message: 'subjectId is required for instructor/coordinator scans' })
    }

    const access = await getOwnedSubject(subjectId, context)
    if (access.error) return result.withStatus(access.error.status, { message: access.error.message })

    const dayRange = getDayRange(attendanceDate || new Date())
    if (!dayRange) return result.withStatus(400, { message: 'Please provide a valid attendance date.' })

    const enrollment = await prisma.subjectEnrollment.findUnique({
      where: { subjectId_studentId: { subjectId, studentId: student.id } }
    })
    if (!enrollment) return result.withStatus(400, { message: 'This student is not enrolled in the selected subject.' })

    const instructorId = access.instructor?.id || access.subject.instructorId
    if (!instructorId) return result.withStatus(400, { message: 'Assign an instructor to this subject before managing attendance.' })
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
      actorId: context.user.id,
      actorRole: context.user.role,
      action: 'STAFF_STUDENT_ID_ATTENDANCE_MARKED',
      entityType: 'Attendance',
      metadata: { studentId: student.id, subjectId, attendanceId: record.id, date: dayRange.start }
    })

    return result.withStatus(201, {
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
    throw error
  }
}

module.exports = { generateQR, markAttendanceQR, markDailyAttendanceQR, getLiveGateAttendanceQr, generateDailyAttendanceQR, scanStudentIdAttendance }
