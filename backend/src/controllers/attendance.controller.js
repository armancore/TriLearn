const prisma = require('../utils/prisma')
const ExcelJS = require('exceljs')
const PDFDocument = require('pdfkit')
const QRCode = require('qrcode')
const logger = require('../utils/logger')
const { getPagination } = require('../utils/pagination')
const { recordAuditLog } = require('../utils/audit')

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE']
const QR_VALIDITY_MINUTES = 15
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

const getDayRange = (dateValue) => {
  const baseDate = dateValue ? new Date(dateValue) : new Date()

  if (Number.isNaN(baseDate.getTime())) {
    return null
  }

  const start = new Date(baseDate)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return { start, end }
}

const getInstructorProfile = (userId) => prisma.instructor.findUnique({
  where: { userId }
})

const getStudentProfile = (userId) => prisma.student.findUnique({
  where: { userId }
})

const getOwnedSubject = async (subjectId, user) => {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: {
      instructor: {
        include: {
          user: { select: { name: true, email: true } }
        }
      }
    }
  })

  if (!subject) {
    return { error: { status: 404, message: 'Subject not found' } }
  }

  if (user.role === 'INSTRUCTOR') {
    const instructor = await getInstructorProfile(user.id)

    if (!instructor) {
      return { error: { status: 403, message: 'Only instructors can manage attendance' } }
    }

    if (!subject.instructorId) {
      return { error: { status: 403, message: 'Assign an instructor to this subject before managing attendance' } }
    }

    if (subject.instructorId !== instructor.id) {
      return { error: { status: 403, message: 'You can only manage attendance for your assigned subjects' } }
    }

    return { subject, instructor }
  }

  return { subject }
}

const getSubjectStudents = async (subject) => {
  const students = await prisma.student.findMany({
    where: {
      user: { isActive: true },
      subjectEnrollments: {
        some: {
          subjectId: subject.id
        }
      }
    },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          isActive: true
        }
      }
    },
    orderBy: [
      { rollNumber: 'asc' },
      { enrolledAt: 'asc' }
    ]
  })

  return students
}

const buildAttendanceSummary = (attendance) => {
  const totals = attendance.reduce((acc, record) => {
    acc.total += 1
    acc[record.status] += 1
    return acc
  }, { total: 0, PRESENT: 0, ABSENT: 0, LATE: 0 })

  return {
    total: totals.total,
    present: totals.PRESENT,
    absent: totals.ABSENT,
    late: totals.LATE
  }
}

const buildStatusSummary = (groups) => {
  const totals = groups.reduce((acc, group) => {
    acc.total += group._count._all
    acc[group.status] = group._count._all
    return acc
  }, { total: 0, PRESENT: 0, ABSENT: 0, LATE: 0 })

  return {
    total: totals.total,
    present: totals.PRESENT,
    absent: totals.ABSENT,
    late: totals.LATE
  }
}

const getCurrentDayName = (date = new Date()) => DAYS[date.getDay()]

const toMinutes = (timeValue) => {
  const [hours, minutes] = timeValue.split(':').map((value) => parseInt(value, 10))
  return (hours * 60) + minutes
}

const buildDateWithTime = (baseDate, timeValue) => {
  const date = new Date(baseDate)
  const [hours, minutes] = timeValue.split(':').map((value) => parseInt(value, 10))
  date.setHours(hours, minutes, 0, 0)
  return date
}

const getTodayGateWindow = async () => {
  const dayRange = getDayRange()
  const todayName = getCurrentDayName(dayRange.start)

  const firstRoutine = await prisma.routine.findFirst({
    where: { dayOfWeek: todayName },
    orderBy: { startTime: 'asc' }
  })

  if (!firstRoutine) {
    return null
  }

  const startAt = buildDateWithTime(dayRange.start, firstRoutine.startTime)
  const cutoffAt = new Date(startAt)
  cutoffAt.setMinutes(cutoffAt.getMinutes() + 30)

  return {
    dayRange,
    dayOfWeek: todayName,
    firstRoutine,
    startAt,
    cutoffAt
  }
}

const parseQrPayload = (qrData) => {
  try {
    return JSON.parse(qrData)
  } catch {
    return null
  }
}

const formatDisplayDate = (dateValue) => new Date(dateValue).toLocaleDateString('en-CA')

const sanitizeFilenamePart = (value) => String(value || 'report').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()

const getAttendanceExportPayload = async ({ subjectId, date, user }) => {
  const access = await getOwnedSubject(subjectId, user)
  if (access.error) {
    return { error: access.error }
  }

  const filters = { subjectId }
  const dayRange = date ? getDayRange(date) : null

  if (date && !dayRange) {
    return { error: { status: 400, message: 'Please provide a valid date filter' } }
  }

  if (dayRange) {
    filters.date = { gte: dayRange.start, lt: dayRange.end }
  }

  const [attendance, groupedSummary] = await Promise.all([
    prisma.attendance.findMany({
      where: filters,
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true } }
          }
        },
        subject: { select: { name: true, code: true } }
      },
      orderBy: [
        { date: 'desc' },
        { student: { rollNumber: 'asc' } }
      ]
    }),
    prisma.attendance.groupBy({
      by: ['status'],
      where: filters,
      _count: { _all: true }
    })
  ])

  return {
    attendance,
    summary: buildStatusSummary(groupedSummary),
    subject: access.subject,
    dateLabel: dayRange ? formatDisplayDate(dayRange.start) : 'All dates'
  }
}

const exportAttendancePdf = ({ res, attendance, summary, subject, dateLabel }) => {
  const fileName = `attendance-${sanitizeFilenamePart(subject.code || subject.name)}-${sanitizeFilenamePart(dateLabel)}.pdf`
  const doc = new PDFDocument({ margin: 40, size: 'A4' })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)

  doc.pipe(res)
  doc.fontSize(18).text('Attendance Report', { align: 'center' })
  doc.moveDown(0.5)
  doc.fontSize(12).text(`Subject: ${subject.name} (${subject.code})`)
  doc.text(`Date: ${dateLabel}`)
  doc.text(`Generated: ${formatDisplayDate(new Date())}`)
  doc.moveDown()

  doc.fontSize(12).text(`Total Records: ${summary.total}`)
  doc.text(`Present: ${summary.present}`)
  doc.text(`Absent: ${summary.absent}`)
  doc.text(`Late: ${summary.late}`)
  doc.moveDown()

  attendance.forEach((record, index) => {
    if (doc.y > 730) {
      doc.addPage()
    }

    const studentName = record.student?.user?.name || 'Unknown Student'
    const rollNumber = record.student?.rollNumber || '-'
    const studentEmail = record.student?.user?.email || '-'

    doc
      .fontSize(10)
      .text(`${index + 1}. ${studentName}`)
      .text(`Roll: ${rollNumber} | Email: ${studentEmail}`)
      .text(`Date: ${formatDisplayDate(record.date)} | Status: ${record.status}`)
      .moveDown(0.5)
  })

  doc.end()
}

const exportAttendanceWorkbook = async ({ res, attendance, summary, subject, dateLabel }) => {
  const workbook = new ExcelJS.Workbook()
  const summarySheet = workbook.addWorksheet('Summary')
  const recordsSheet = workbook.addWorksheet('Records')
  const fileName = `attendance-${sanitizeFilenamePart(subject.code || subject.name)}-${sanitizeFilenamePart(dateLabel)}.xlsx`

  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 24 },
    { header: 'Value', key: 'value', width: 32 }
  ]
  summarySheet.addRows([
    { metric: 'Subject', value: `${subject.name} (${subject.code})` },
    { metric: 'Date', value: dateLabel },
    { metric: 'Total Records', value: summary.total },
    { metric: 'Present', value: summary.present },
    { metric: 'Absent', value: summary.absent },
    { metric: 'Late', value: summary.late }
  ])

  recordsSheet.columns = [
    { header: 'S.N.', key: 'sn', width: 8 },
    { header: 'Student Name', key: 'name', width: 28 },
    { header: 'Roll Number', key: 'rollNumber', width: 20 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Date', key: 'date', width: 16 },
    { header: 'Status', key: 'status', width: 14 }
  ]
  attendance.forEach((record, index) => {
    recordsSheet.addRow({
      sn: index + 1,
      name: record.student?.user?.name || 'Unknown Student',
      rollNumber: record.student?.rollNumber || '-',
      email: record.student?.user?.email || '-',
      date: formatDisplayDate(record.date),
      status: record.status
    })
  })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
  await workbook.xlsx.write(res)
  res.end()
}

// ================================
// GENERATE QR CODE (Instructor)
// ================================
const generateQR = async (req, res) => {
  try {
    const { subjectId } = req.body

    const access = await getOwnedSubject(subjectId, req.user)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    const { instructor, subject } = access

    // Create QR data with timestamp (valid for 10 minutes)
    const qrData = JSON.stringify({
      subjectId,
      instructorId: instructor.id,
      date: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    })

    // Generate QR code as base64 image
    const qrCode = await QRCode.toDataURL(qrData)

    res.json({
      message: 'QR Code generated successfully!',
      qrCode,
      expiresIn: '10 minutes',
      subjectId,
      instructorId: instructor.id
    })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// MARK ATTENDANCE VIA QR (Student)
// ================================
const markAttendanceQR = async (req, res) => {
  try {
    const { qrData } = req.body

    const student = await getStudentProfile(req.user.id)

    if (!student) {
      return res.status(403).json({ message: 'Only students can mark attendance' })
    }

    const parsedQR = parseQrPayload(qrData)
    if (!parsedQR) {
      return res.status(400).json({ message: 'Invalid QR code' })
    }

    // Check if QR is expired
    if (new Date() > new Date(parsedQR.expiresAt)) {
      return res.status(400).json({ message: 'QR code has expired' })
    }

    const { subjectId, instructorId } = parsedQR
    const subject = await prisma.subject.findUnique({ where: { id: subjectId } })

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' })
    }

    const enrollment = await prisma.subjectEnrollment.findUnique({
      where: {
        subjectId_studentId: {
          subjectId,
          studentId: student.id
        }
      }
    })

    if (!enrollment) {
      return res.status(403).json({ message: 'You are not eligible to mark attendance for this subject' })
    }

    // Check if already marked today
    const todayRange = getDayRange()

    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        studentId: student.id,
        subjectId,
        date: { gte: todayRange.start, lt: todayRange.end }
      }
    })

    if (existingAttendance) {
      return res.status(400).json({ message: 'Attendance already marked for today' })
    }

    // Mark attendance
    const attendance = await prisma.attendance.create({
      data: {
        studentId: student.id,
        subjectId,
        instructorId,
        status: 'PRESENT',
        qrCode: qrData,
        date: todayRange.start
      },
      include: {
        subject: { select: { name: true, code: true } },
        student: { include: { user: { select: { name: true } } } }
      }
    })

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
      metadata: {
        subjectId,
        attendanceDate: todayRange.start
      }
    })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// MARK ATTENDANCE MANUALLY (Instructor)
// ================================
const markAttendanceManual = async (req, res) => {
  try {
    const { subjectId, attendanceDate, attendanceList } = req.body

    const access = await getOwnedSubject(subjectId, req.user)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    if (!Array.isArray(attendanceList) || attendanceList.length === 0) {
      return res.status(400).json({ message: 'Please provide at least one attendance entry' })
    }

    const dayRange = getDayRange(attendanceDate)
    if (!dayRange) {
      return res.status(400).json({ message: 'Please provide a valid attendance date' })
    }

    const subjectStudents = await getSubjectStudents(access.subject)
    const allowedStudentIds = new Set(subjectStudents.map((student) => student.id))

    const invalidEntry = attendanceList.find(({ studentId, status }) => (
      !studentId || !allowedStudentIds.has(studentId) || !ATTENDANCE_STATUSES.includes(status)
    ))

    if (invalidEntry) {
      return res.status(400).json({ message: 'Attendance list contains invalid student or status values' })
    }

    const existingRecords = await prisma.attendance.findMany({
      where: {
        subjectId,
        studentId: { in: attendanceList.map(({ studentId }) => studentId) },
        date: { gte: dayRange.start, lt: dayRange.end }
      }
    })

    const existingMap = new Map(existingRecords.map((record) => [record.studentId, record]))

    const records = await prisma.$transaction(
      attendanceList.map(({ studentId, status }) => {
        const existing = existingMap.get(studentId)

        if (existing) {
          return prisma.attendance.update({
            where: { id: existing.id },
            data: {
              status,
              instructorId: access.instructor.id,
              qrCode: null,
              date: dayRange.start
            }
          })
        }

        return prisma.attendance.create({
          data: {
            studentId,
            subjectId,
            instructorId: access.instructor.id,
            status,
            date: dayRange.start
          }
        })
      })
    )

    res.status(201).json({
      message: 'Attendance marked successfully!',
      total: records.length,
      records,
      date: dayRange.start
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'ATTENDANCE_MARKED_MANUALLY',
      entityType: 'Attendance',
      entityId: subjectId,
      metadata: {
        subjectId,
        attendanceDate: dayRange.start,
        totalRecords: records.length
      }
    })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET ATTENDANCE BY SUBJECT (Instructor)
// ================================
const getAttendanceBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params
    const { date } = req.query
    const { page, limit, skip } = getPagination(req.query)

    const access = await getOwnedSubject(subjectId, req.user)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    const filters = { subjectId }
    const dayRange = date ? getDayRange(date) : null

    if (date && !dayRange) {
      return res.status(400).json({ message: 'Please provide a valid date filter' })
    }

    if (dayRange) {
      filters.date = { gte: dayRange.start, lt: dayRange.end }
    }

    const [attendance, total, groupedSummary] = await Promise.all([
      prisma.attendance.findMany({
        where: filters,
        include: {
          student: {
            include: {
              user: { select: { name: true, email: true } }
            }
          },
          subject: { select: { name: true, code: true } }
        },
        orderBy: [
          { date: 'desc' },
          { student: { rollNumber: 'asc' } }
        ],
        skip,
        take: limit
      }),
      prisma.attendance.count({ where: filters }),
      prisma.attendance.groupBy({
        by: ['status'],
        where: filters,
        _count: { _all: true }
      })
    ])

    res.json({
      total,
      page,
      limit,
      attendance,
      summary: buildStatusSummary(groupedSummary),
      subject: access.subject
    })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET MY ATTENDANCE (Student)
// ================================
const getMyAttendance = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query)
    const student = await getStudentProfile(req.user.id)

    if (!student) {
      return res.status(403).json({ message: 'Only students can view their attendance' })
    }

    const [attendance, total, allAttendance] = await Promise.all([
      prisma.attendance.findMany({
        where: { studentId: student.id },
        include: {
          subject: { select: { name: true, code: true } }
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit
      }),
      prisma.attendance.count({
        where: { studentId: student.id }
      }),
      prisma.attendance.findMany({
        where: { studentId: student.id },
        include: {
          subject: { select: { name: true, code: true } }
        }
      })
    ])

    // Calculate percentage per subject
    const subjectMap = {}
    allAttendance.forEach(a => {
      const key = a.subjectId
      if (!subjectMap[key]) {
        subjectMap[key] = { total: 0, present: 0, absent: 0, late: 0, subject: a.subject }
      }
      subjectMap[key].total++
      if (a.status === 'PRESENT') subjectMap[key].present++
      if (a.status === 'ABSENT') subjectMap[key].absent++
      if (a.status === 'LATE') subjectMap[key].late++
    })

    const summary = Object.values(subjectMap).map(s => ({
      subject: s.subject.name,
      code: s.subject.code,
      total: s.total,
      present: s.present,
      absent: s.absent,
      late: s.late,
      percentage: ((s.present / s.total) * 100).toFixed(1) + '%'
    })).sort((a, b) => a.code.localeCompare(b.code))

    res.json({ total, page, limit, attendance, summary })

  } catch (error) {
    res.internalError(error)
  }
}

const getSubjectRoster = async (req, res) => {
  try {
    const { subjectId } = req.params
    const { date } = req.query

    const access = await getOwnedSubject(subjectId, req.user)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    const dayRange = getDayRange(date)
    if (!dayRange) {
      return res.status(400).json({ message: 'Please provide a valid date' })
    }

    const [students, attendance] = await Promise.all([
      getSubjectStudents(access.subject),
      prisma.attendance.findMany({
        where: {
          subjectId,
          date: { gte: dayRange.start, lt: dayRange.end }
        }
      })
    ])

    const attendanceMap = new Map(attendance.map((record) => [record.studentId, record]))
    const roster = students.map((student) => ({
      id: student.id,
      rollNumber: student.rollNumber,
      semester: student.semester,
      section: student.section,
      department: student.department,
      name: student.user.name,
      email: student.user.email,
      status: attendanceMap.get(student.id)?.status || 'PRESENT',
      attendanceId: attendanceMap.get(student.id)?.id || null
    }))

    res.json({
      subject: access.subject,
      date: dayRange.start,
      total: roster.length,
      roster,
      summary: buildAttendanceSummary(attendance)
    })
  } catch (error) {
    res.internalError(error)
  }
}

const exportAttendanceBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params
    const { date, format = 'xlsx' } = req.query

    const report = await getAttendanceExportPayload({
      subjectId,
      date,
      user: req.user
    })

    if (report.error) {
      return res.status(report.error.status).json({ message: report.error.message })
    }

    if (format === 'pdf') {
      exportAttendancePdf({ res, ...report })
      return
    }

    await exportAttendanceWorkbook({ res, ...report })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// MARK ATTENDANCE FOR TODAY'S ROUTINE (Student)
// ================================
const markDailyAttendanceQR = async (req, res) => {
  try {
    const { qrData } = req.body

    const student = await getStudentProfile(req.user.id)
    if (!student) {
      return res.status(403).json({ message: 'Only students can mark attendance' })
    }

    const parsedQR = parseQrPayload(qrData)
    if (!parsedQR || parsedQR.type !== 'DAILY_ATTENDANCE') {
      return res.status(400).json({ message: 'Invalid daily attendance QR code' })
    }

    const gateWindow = await getTodayGateWindow()
    if (!gateWindow) {
      return res.status(400).json({ message: 'No routine is scheduled for today' })
    }

    if (parsedQR.dayOfWeek !== gateWindow.dayOfWeek) {
      return res.status(400).json({ message: 'QR code is not valid for today' })
    }

    if (new Date() > new Date(parsedQR.expiresAt) || new Date() > gateWindow.cutoffAt) {
      return res.status(400).json({ message: 'Gate QR scan time is over. Please contact your instructor for manual attendance.' })
    }

    const routines = await prisma.routine.findMany({
      where: {
        dayOfWeek: gateWindow.dayOfWeek,
        subject: {
          enrollments: {
            some: {
              studentId: student.id
            }
          }
        }
      },
      include: {
        subject: { select: { id: true, name: true, code: true } }
      },
      orderBy: { startTime: 'asc' }
    })

    if (routines.length === 0) {
      return res.status(400).json({ message: 'No enrolled classes are scheduled for you today' })
    }

    const uniqueBySubject = new Map()
    routines.forEach((routine) => {
      if (!uniqueBySubject.has(routine.subjectId)) {
        uniqueBySubject.set(routine.subjectId, routine)
      }
    })

    const subjectIds = [...uniqueBySubject.keys()]
    const existingAttendance = await prisma.attendance.findMany({
      where: {
        studentId: student.id,
        subjectId: { in: subjectIds },
        date: { gte: gateWindow.dayRange.start, lt: gateWindow.dayRange.end }
      }
    })

    const existingMap = new Map(existingAttendance.map((record) => [record.subjectId, record]))
    const routinesToMark = subjectIds.filter((subjectId) => !existingMap.has(subjectId))

    if (routinesToMark.length === 0) {
      return res.status(400).json({ message: "Attendance already marked for all of today's classes" })
    }

    await prisma.$transaction(
      routinesToMark.map((subjectId) => {
        const routine = uniqueBySubject.get(subjectId)
        return prisma.attendance.create({
          data: {
            studentId: student.id,
            subjectId,
            instructorId: routine.instructorId,
            status: 'PRESENT',
            qrCode: qrData,
            date: gateWindow.dayRange.start
          }
        })
      })
    )

    const markedSubjects = routinesToMark.map((subjectId) => ({
      id: subjectId,
      name: uniqueBySubject.get(subjectId).subject.name,
      code: uniqueBySubject.get(subjectId).subject.code,
      startTime: uniqueBySubject.get(subjectId).startTime
    }))

    const skippedSubjects = subjectIds
      .filter((subjectId) => existingMap.has(subjectId))
      .map((subjectId) => ({
        id: subjectId,
        name: uniqueBySubject.get(subjectId).subject.name,
        code: uniqueBySubject.get(subjectId).subject.code
      }))

    res.status(201).json({
      message: `Attendance marked for ${markedSubjects.length} class${markedSubjects.length > 1 ? 'es' : ''}!`,
      markedSubjects,
      skippedSubjects,
      date: gateWindow.dayRange.start,
      cutoffAt: gateWindow.cutoffAt
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'DAILY_GATE_ATTENDANCE_MARKED',
      entityType: 'Attendance',
      metadata: {
        date: gateWindow.dayRange.start,
        markedSubjectIds: routinesToMark,
        skippedSubjectIds: skippedSubjects.map((subject) => subject.id)
      }
    })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GENERATE DAILY ENTRY QR (Admin/Instructor)
// ================================
const generateDailyAttendanceQR = async (req, res) => {
  try {
    const gateWindow = await getTodayGateWindow()
    if (!gateWindow) {
      return res.status(400).json({ message: 'No routine is scheduled for today, so no gate QR is needed.' })
    }

    const issuedAt = new Date()
    const expiresAt = gateWindow.cutoffAt

    const qrData = JSON.stringify({
      type: 'DAILY_ATTENDANCE',
      issuedBy: req.user.id,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      dayOfWeek: gateWindow.dayOfWeek,
      firstClassStart: gateWindow.firstRoutine.startTime,
      cutoffAt: gateWindow.cutoffAt.toISOString()
    })

    const qrCode = await QRCode.toDataURL(qrData)

    res.json({
      message: 'Daily attendance QR generated successfully!',
      qrCode,
      qrData,
      expiresIn: `${gateWindow.firstRoutine.startTime} to ${gateWindow.cutoffAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      dayOfWeek: gateWindow.dayOfWeek,
      firstClassStart: gateWindow.firstRoutine.startTime,
      cutoffAt: gateWindow.cutoffAt
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'DAILY_GATE_QR_GENERATED',
      entityType: 'Attendance',
      metadata: {
        dayOfWeek: gateWindow.dayOfWeek,
        firstClassStart: gateWindow.firstRoutine.startTime,
        cutoffAt: gateWindow.cutoffAt
      }
    })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = {
  generateDailyAttendanceQR,
  generateQR,
  markAttendanceQR,
  markDailyAttendanceQR,
  markAttendanceManual,
  getAttendanceBySubject,
  exportAttendanceBySubject,
  getMyAttendance,
  getSubjectRoster
}


