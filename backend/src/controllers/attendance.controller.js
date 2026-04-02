const prisma = require('../utils/prisma')
const crypto = require('crypto')
const ExcelJS = require('exceljs')
const PDFDocument = require('pdfkit')
const QRCode = require('qrcode')
const logger = require('../utils/logger')
const { getPagination } = require('../utils/pagination')
const { recordAuditLog } = require('../utils/audit')

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE']
const QR_VALIDITY_MINUTES = 15
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET || 'edunexus-qr-secret'

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

const getMonthRange = (monthValue) => {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) {
    return null
  }

  const [year, month] = monthValue.split('-').map((value) => parseInt(value, 10))
  const start = new Date(year, month - 1, 1)

  if (Number.isNaN(start.getTime())) {
    return null
  }

  start.setHours(0, 0, 0, 0)
  const end = new Date(year, month, 1)
  end.setHours(0, 0, 0, 0)

  return { start, end }
}

const getOwnedSubject = async (subjectId, req) => {
  const { user, instructor } = req
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
    if (!instructor) {
      return { error: { status: 403, message: 'Instructor profile not found' } }
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

const getRoutineScanWindow = (baseDate, routine) => {
  const startsAt = buildDateWithTime(baseDate, routine.startTime)
  const endsAt = new Date(startsAt)
  endsAt.setMinutes(endsAt.getMinutes() + 15)

  return { startsAt, endsAt }
}

const getActiveRoutineWindows = async (referenceDate = new Date()) => {
  const dayRange = getDayRange(referenceDate)
  const dayOfWeek = getCurrentDayName(dayRange.start)

  const routines = await prisma.routine.findMany({
    where: { dayOfWeek },
    include: {
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
          semester: true,
          department: true
        }
      }
    },
    orderBy: { startTime: 'asc' }
  })

  const active = []
  let nextWindow = null

  routines.forEach((routine) => {
    const window = getRoutineScanWindow(dayRange.start, routine)
    const enriched = {
      ...routine,
      startsAt: window.startsAt,
      endsAt: window.endsAt
    }

    if (referenceDate >= window.startsAt && referenceDate <= window.endsAt) {
      active.push(enriched)
      return
    }

    if (referenceDate < window.startsAt) {
      if (!nextWindow || window.startsAt < nextWindow.startsAt) {
        nextWindow = enriched
      }
    }
  })

  return { dayRange, dayOfWeek, active, nextWindow }
}

const syncClosedRoutineAbsences = async (referenceDate = new Date()) => {
  const { dayRange, dayOfWeek } = await getActiveRoutineWindows(referenceDate)

  const routines = await prisma.routine.findMany({
    where: { dayOfWeek },
    include: {
      subject: {
        select: {
          id: true,
          enrollments: {
            select: {
              studentId: true
            }
          }
        }
      }
    },
    orderBy: { startTime: 'asc' }
  })

  const closedRoutines = routines.filter((routine) => {
    const { endsAt } = getRoutineScanWindow(dayRange.start, routine)
    return referenceDate > endsAt
  })

  if (!closedRoutines.length) {
    return
  }

  const subjectIds = closedRoutines.map((routine) => routine.subjectId)
  const existingAttendance = await prisma.attendance.findMany({
    where: {
      subjectId: { in: subjectIds },
      date: { gte: dayRange.start, lt: dayRange.end }
    },
    select: {
      studentId: true,
      subjectId: true
    }
  })

  const existingKeys = new Set(existingAttendance.map((record) => `${record.studentId}:${record.subjectId}`))
  const absencesToCreate = []

  closedRoutines.forEach((routine) => {
    routine.subject.enrollments.forEach((enrollment) => {
      const key = `${enrollment.studentId}:${routine.subjectId}`
      if (existingKeys.has(key)) {
        return
      }

      existingKeys.add(key)
      absencesToCreate.push({
        studentId: enrollment.studentId,
        subjectId: routine.subjectId,
        instructorId: routine.instructorId,
        status: 'ABSENT',
        date: dayRange.start
      })
    })
  })

  if (absencesToCreate.length > 0) {
    await prisma.attendance.createMany({
      data: absencesToCreate,
      skipDuplicates: true
    })
  }
}

const parseQrPayload = (qrData) => {
  try {
    const parsed = JSON.parse(qrData)
    if (!parsed || typeof parsed !== 'object') return null

    const payload = parsed.payload
    const signature = parsed.signature

    if (!payload || typeof payload !== 'object' || typeof signature !== 'string') {
      return null
    }

    const expectedSignature = crypto
      .createHmac('sha256', QR_SIGNING_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex')

    const receivedSignature = Buffer.from(signature, 'hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')

    if (
      receivedSignature.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(receivedSignature, expectedBuffer)
    ) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

const createSignedQrPayload = (payload) => {
  const signature = crypto
    .createHmac('sha256', QR_SIGNING_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex')

  return JSON.stringify({ payload, signature })
}

const formatDisplayDate = (dateValue) => new Date(dateValue).toLocaleDateString('en-CA')
const formatMonthLabel = (monthValue) => {
  const range = getMonthRange(monthValue)
  if (!range) return monthValue
  return range.start.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

const sanitizeFilenamePart = (value) => String(value || 'report').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()

const getAttendanceExportPayload = async ({ subjectId, date, month, req }) => {
  const access = await getOwnedSubject(subjectId, req)
  if (access.error) {
    return { error: access.error }
  }

  const filters = { subjectId }
  const dayRange = date ? getDayRange(date) : null
  const monthRange = month ? getMonthRange(month) : null

  if (date && !dayRange) {
    return { error: { status: 400, message: 'Please provide a valid date filter' } }
  }

  if (month && !monthRange) {
    return { error: { status: 400, message: 'Please provide a valid month filter' } }
  }

  if (dayRange && monthRange) {
    return { error: { status: 400, message: 'Use either a date or a month filter, not both' } }
  }

  if (dayRange) {
    filters.date = { gte: dayRange.start, lt: dayRange.end }
  } else if (monthRange) {
    filters.date = { gte: monthRange.start, lt: monthRange.end }
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
    dateLabel: dayRange ? formatDisplayDate(dayRange.start) : monthRange ? formatMonthLabel(month) : 'All dates'
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

const getCoordinatorDepartmentReportPayload = async ({ coordinator, month, semester, section }) => {
  if (!coordinator || !coordinator.department) {
    return { error: { status: 403, message: 'Coordinator department is not configured yet' } }
  }

  const monthRange = getMonthRange(month)
  if (!monthRange) {
    return { error: { status: 400, message: 'Please provide a valid month in YYYY-MM format' } }
  }

  const normalizedSemester = parseInt(semester, 10)
  const studentFilters = {
    department: coordinator.department,
    semester: normalizedSemester,
    user: { isActive: true }
  }

  if (section) {
    studentFilters.section = section
  }

  const students = await prisma.student.findMany({
    where: studentFilters,
    include: {
      user: {
        select: {
          name: true,
          email: true
        }
      }
    },
    orderBy: [
      { rollNumber: 'asc' },
      { enrolledAt: 'asc' }
    ]
  })

  const studentIds = students.map((student) => student.id)
  const attendance = studentIds.length > 0
    ? await prisma.attendance.findMany({
        where: {
          studentId: { in: studentIds },
          date: { gte: monthRange.start, lt: monthRange.end }
        },
        include: {
          subject: { select: { name: true, code: true } },
          student: {
            include: {
              user: { select: { name: true, email: true } }
            }
          }
        },
        orderBy: [
          { date: 'desc' },
          { subject: { code: 'asc' } },
          { student: { rollNumber: 'asc' } }
        ]
      })
    : []

  const attendanceByStudent = new Map()
  attendance.forEach((record) => {
    const list = attendanceByStudent.get(record.studentId) || []
    list.push(record)
    attendanceByStudent.set(record.studentId, list)
  })

  const studentSummaries = students.map((student) => {
    const records = attendanceByStudent.get(student.id) || []
    const counts = records.reduce((acc, record) => {
      acc.total += 1
      acc[record.status] += 1
      return acc
    }, { total: 0, PRESENT: 0, ABSENT: 0, LATE: 0 })

    return {
      id: student.id,
      name: student.user.name,
      email: student.user.email,
      rollNumber: student.rollNumber,
      semester: student.semester,
      section: student.section,
      present: counts.PRESENT,
      absent: counts.ABSENT,
      late: counts.LATE,
      totalRecords: counts.total,
      monthlyAverage: counts.total > 0 ? ((counts.PRESENT / counts.total) * 100).toFixed(1) : '0.0'
    }
  })

  return {
    department: coordinator.department,
    month,
    monthLabel: formatMonthLabel(month),
    semester: normalizedSemester,
    section: section || '',
    totalStudents: students.length,
    summary: buildAttendanceSummary(attendance),
    students: studentSummaries,
    records: attendance.map((record) => ({
      id: record.id,
      date: record.date,
      status: record.status,
      subject: record.subject,
      student: {
        id: record.student.id,
        name: record.student.user.name,
        email: record.student.user.email,
        rollNumber: record.student.rollNumber,
        section: record.student.section
      }
    }))
  }
}

const exportCoordinatorDepartmentReportPdf = ({ res, report }) => {
  const fileName = `department-attendance-${sanitizeFilenamePart(report.department)}-sem-${report.semester}-${sanitizeFilenamePart(report.monthLabel)}${report.section ? `-section-${sanitizeFilenamePart(report.section)}` : ''}.pdf`
  const doc = new PDFDocument({ margin: 40, size: 'A4' })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)

  doc.pipe(res)
  doc.fontSize(18).text('Department Attendance Report', { align: 'center' })
  doc.moveDown(0.5)
  doc.fontSize(12).text(`Department: ${report.department}`)
  doc.text(`Semester: ${report.semester}`)
  doc.text(`Section: ${report.section || 'All sections'}`)
  doc.text(`Month: ${report.monthLabel}`)
  doc.moveDown()

  doc.text(`Total Students: ${report.totalStudents}`)
  doc.text(`Present Entries: ${report.summary.present}`)
  doc.text(`Absent Entries: ${report.summary.absent}`)
  doc.text(`Late Entries: ${report.summary.late}`)
  doc.moveDown()

  doc.fontSize(13).text('Student Monthly Averages')
  doc.moveDown(0.5)

  report.students.forEach((student, index) => {
    if (doc.y > 730) doc.addPage()
    doc
      .fontSize(10)
      .text(`${index + 1}. ${student.name} (${student.rollNumber})`)
      .text(`Section: ${student.section || '-'} | Present: ${student.present} | Absent: ${student.absent} | Late: ${student.late} | Average: ${student.monthlyAverage}%`)
      .moveDown(0.4)
  })

  if (report.records.length > 0) {
    doc.addPage()
    doc.fontSize(13).text('Attendance Record List')
    doc.moveDown(0.5)
    report.records.forEach((record, index) => {
      if (doc.y > 730) doc.addPage()
      doc
        .fontSize(10)
        .text(`${index + 1}. ${record.student.name} (${record.student.rollNumber})`)
        .text(`Subject: ${record.subject.name} (${record.subject.code})`)
        .text(`Date: ${formatDisplayDate(record.date)} | Status: ${record.status}`)
        .moveDown(0.4)
    })
  }

  doc.end()
}

const exportCoordinatorDepartmentReportWorkbook = async ({ res, report }) => {
  const workbook = new ExcelJS.Workbook()
  const summarySheet = workbook.addWorksheet('Summary')
  const studentsSheet = workbook.addWorksheet('Student Averages')
  const recordsSheet = workbook.addWorksheet('Attendance Records')
  const fileName = `department-attendance-${sanitizeFilenamePart(report.department)}-sem-${report.semester}-${sanitizeFilenamePart(report.monthLabel)}${report.section ? `-section-${sanitizeFilenamePart(report.section)}` : ''}.xlsx`

  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 24 },
    { header: 'Value', key: 'value', width: 32 }
  ]
  summarySheet.addRows([
    { metric: 'Department', value: report.department },
    { metric: 'Semester', value: report.semester },
    { metric: 'Section', value: report.section || 'All sections' },
    { metric: 'Month', value: report.monthLabel },
    { metric: 'Total Students', value: report.totalStudents },
    { metric: 'Present Entries', value: report.summary.present },
    { metric: 'Absent Entries', value: report.summary.absent },
    { metric: 'Late Entries', value: report.summary.late }
  ])

  studentsSheet.columns = [
    { header: 'S.N.', key: 'sn', width: 8 },
    { header: 'Student Name', key: 'name', width: 28 },
    { header: 'Roll Number', key: 'rollNumber', width: 20 },
    { header: 'Section', key: 'section', width: 14 },
    { header: 'Present', key: 'present', width: 12 },
    { header: 'Absent', key: 'absent', width: 12 },
    { header: 'Late', key: 'late', width: 12 },
    { header: 'Monthly Average %', key: 'monthlyAverage', width: 18 }
  ]
  report.students.forEach((student, index) => {
    studentsSheet.addRow({
      sn: index + 1,
      name: student.name,
      rollNumber: student.rollNumber,
      section: student.section || '-',
      present: student.present,
      absent: student.absent,
      late: student.late,
      monthlyAverage: student.monthlyAverage
    })
  })

  recordsSheet.columns = [
    { header: 'S.N.', key: 'sn', width: 8 },
    { header: 'Student Name', key: 'studentName', width: 28 },
    { header: 'Roll Number', key: 'rollNumber', width: 18 },
    { header: 'Subject', key: 'subjectName', width: 28 },
    { header: 'Subject Code', key: 'subjectCode', width: 16 },
    { header: 'Date', key: 'date', width: 16 },
    { header: 'Status', key: 'status', width: 14 }
  ]
  report.records.forEach((record, index) => {
    recordsSheet.addRow({
      sn: index + 1,
      studentName: record.student.name,
      rollNumber: record.student.rollNumber,
      subjectName: record.subject.name,
      subjectCode: record.subject.code,
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

    const access = await getOwnedSubject(subjectId, req)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    const { subject } = access
    const instructorId = access.instructor?.id || subject.instructorId

    if (!instructorId) {
      return res.status(400).json({ message: 'Assign an instructor to this subject before managing attendance' })
    }

    // Create QR data with timestamp (valid for 10 minutes)
    const qrData = createSignedQrPayload({
      subjectId,
      instructorId,
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
      instructorId
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

    const student = req.student

    if (!student) {
      return res.status(403).json({ message: 'Student profile not found' })
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

    let attendance

    try {
      attendance = await prisma.attendance.create({
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
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(400).json({ message: 'Attendance already marked for today' })
      }

      throw error
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

    const access = await getOwnedSubject(subjectId, req)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    const instructorId = access.instructor?.id || access.subject.instructorId
    if (!instructorId) {
      return res.status(400).json({ message: 'Assign an instructor to this subject before managing attendance' })
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

    const records = await prisma.$transaction(
      attendanceList.map(({ studentId, status }) => {
        return prisma.attendance.upsert({
          where: {
            studentId_subjectId_date: {
              studentId,
              subjectId,
              date: dayRange.start
            }
          },
          update: {
            status,
            instructorId,
            qrCode: null,
            date: dayRange.start
          },
          create: {
            studentId,
            subjectId,
            instructorId,
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

    await syncClosedRoutineAbsences(date ? new Date(date) : new Date())

    const access = await getOwnedSubject(subjectId, req)
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
    const student = req.student

    if (!student) {
      return res.status(403).json({ message: 'Student profile not found' })
    }

    await syncClosedRoutineAbsences()

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

    await syncClosedRoutineAbsences(date ? new Date(date) : new Date())

    const access = await getOwnedSubject(subjectId, req)
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

const getCoordinatorDepartmentAttendanceReport = async (req, res) => {
  try {
    const { month, semester, section } = req.query
    await syncClosedRoutineAbsences()
    const report = await getCoordinatorDepartmentReportPayload({
      coordinator: req.coordinator,
      month,
      semester,
      section
    })

    if (report.error) {
      return res.status(report.error.status).json({ message: report.error.message })
    }

    res.json(report)
  } catch (error) {
    res.internalError(error)
  }
}

const exportCoordinatorDepartmentAttendanceReport = async (req, res) => {
  try {
    const { month, semester, section, format = 'xlsx' } = req.query
    const report = await getCoordinatorDepartmentReportPayload({
      coordinator: req.coordinator,
      month,
      semester,
      section
    })

    if (report.error) {
      return res.status(report.error.status).json({ message: report.error.message })
    }

    if (format === 'pdf') {
      exportCoordinatorDepartmentReportPdf({ res, report })
      return
    }

    await exportCoordinatorDepartmentReportWorkbook({ res, report })
  } catch (error) {
    res.internalError(error)
  }
}

const getMonthlyAttendanceReport = async (req, res) => {
  try {
    const { subjectId } = req.params
    const { month } = req.query

    await syncClosedRoutineAbsences()

    const access = await getOwnedSubject(subjectId, req)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    const monthRange = getMonthRange(month)
    if (!monthRange) {
      return res.status(400).json({ message: 'Please provide a valid month in YYYY-MM format' })
    }

    const [students, attendance] = await Promise.all([
      getSubjectStudents(access.subject),
      prisma.attendance.findMany({
        where: {
          subjectId,
          date: { gte: monthRange.start, lt: monthRange.end }
        },
        include: {
          student: {
            include: {
              user: { select: { name: true, email: true } }
            }
          }
        },
        orderBy: [
          { date: 'asc' },
          { student: { rollNumber: 'asc' } }
        ]
      })
    ])

    const daysInMonth = new Date(monthRange.start.getFullYear(), monthRange.start.getMonth() + 1, 0).getDate()
    const attendanceMap = new Map()
    attendance.forEach((record) => {
      const key = `${record.studentId}:${formatDisplayDate(record.date)}`
      attendanceMap.set(key, record.status)
    })

    const studentReports = students.map((student) => {
      const dailyStatuses = []
      let present = 0
      let absent = 0
      let late = 0
      let totalRecorded = 0

      for (let day = 1; day <= daysInMonth; day += 1) {
        const currentDate = new Date(monthRange.start)
        currentDate.setDate(day)
        const dateKey = formatDisplayDate(currentDate)
        const status = attendanceMap.get(`${student.id}:${dateKey}`) || null

        if (status) {
          totalRecorded += 1
          if (status === 'PRESENT') present += 1
          if (status === 'ABSENT') absent += 1
          if (status === 'LATE') late += 1
        }

        dailyStatuses.push({
          day,
          date: dateKey,
          status
        })
      }

      return {
        id: student.id,
        name: student.user.name,
        email: student.user.email,
        rollNumber: student.rollNumber,
        semester: student.semester,
        section: student.section,
        department: student.department,
        present,
        absent,
        late,
        totalRecorded,
        percentage: totalRecorded > 0 ? ((present / totalRecorded) * 100).toFixed(1) : '0.0',
        dailyStatuses
      }
    })

    res.json({
      subject: access.subject,
      month,
      monthLabel: formatMonthLabel(month),
      summary: buildAttendanceSummary(attendance),
      totalStudents: students.length,
      totalRecords: attendance.length,
      days: Array.from({ length: daysInMonth }, (_, index) => ({
        day: index + 1,
        date: formatDisplayDate(new Date(monthRange.start.getFullYear(), monthRange.start.getMonth(), index + 1))
      })),
      students: studentReports
    })
  } catch (error) {
    res.internalError(error)
  }
}

const exportAttendanceBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params
    const { date, month, format = 'xlsx' } = req.query

    await syncClosedRoutineAbsences(date ? new Date(date) : new Date())

    const report = await getAttendanceExportPayload({
      subjectId,
      date,
      month,
      req
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

    const student = req.student
    if (!student) {
      return res.status(403).json({ message: 'Student profile not found' })
    }

    await syncClosedRoutineAbsences()

    const parsedQR = parseQrPayload(qrData)
    if (!parsedQR || parsedQR.type !== 'GATE_PERIOD' || !Array.isArray(parsedQR.routineIds)) {
      return res.status(400).json({ message: 'Invalid gate attendance QR code' })
    }

    const now = new Date()
    if (new Date(parsedQR.expiresAt) <= now) {
      return res.status(400).json({ message: 'This gate QR has already rotated. Please scan the latest QR.' })
    }

    const activeWindows = await getActiveRoutineWindows(now)
    if (!activeWindows.active.length) {
      return res.status(400).json({ message: 'There is no active attendance window right now.' })
    }

    const activeMap = new Map(activeWindows.active.map((routine) => [routine.id, routine]))
    const eligibleRoutines = parsedQR.routineIds
      .map((routineId) => activeMap.get(routineId))
      .filter(Boolean)

    if (!eligibleRoutines.length) {
      return res.status(400).json({ message: 'This gate QR is not valid for the current routine window.' })
    }

    const routineIds = eligibleRoutines.map((routine) => routine.id)
    const routines = await prisma.routine.findMany({
      where: {
        id: { in: routineIds },
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

    if (!routines.length) {
      return res.status(400).json({ message: 'You do not have any class scheduled in this active attendance window.' })
    }

    const subjectIds = routines.map((routine) => routine.subjectId)
    const existingAttendance = await prisma.attendance.findMany({
      where: {
        studentId: student.id,
        subjectId: { in: subjectIds },
        date: { gte: activeWindows.dayRange.start, lt: activeWindows.dayRange.end }
      }
    })

    const existingMap = new Map(existingAttendance.map((record) => [record.subjectId, record]))
    const routinesToMark = routines.filter((routine) => !existingMap.has(routine.subjectId))

    if (!routinesToMark.length) {
      return res.status(400).json({ message: 'Attendance has already been recorded for all of your classes in this period.' })
    }

    const upsertedAttendance = await prisma.$transaction(
      routinesToMark.map((routine) => (
        prisma.attendance.upsert({
          where: {
            studentId_subjectId_date: {
              studentId: student.id,
              subjectId: routine.subjectId,
              date: activeWindows.dayRange.start
            }
          },
          update: {
            instructorId: routine.instructorId,
            status: 'PRESENT',
            qrCode: qrData
          },
          create: {
            studentId: student.id,
            subjectId: routine.subjectId,
            instructorId: routine.instructorId,
            status: 'PRESENT',
            qrCode: qrData,
            date: activeWindows.dayRange.start
          }
        })
      ))
    )

    const markedSubjects = upsertedAttendance.map((record) => {
      const routine = routinesToMark.find((item) => item.subjectId === record.subjectId)
      return {
        id: record.subjectId,
        name: routine.subject.name,
        code: routine.subject.code,
        startTime: routine.startTime,
        endTime: routine.endTime
      }
    })

    res.status(201).json({
      message: `Attendance marked for ${markedSubjects.length} class${markedSubjects.length > 1 ? 'es' : ''}.`,
      markedSubjects,
      date: activeWindows.dayRange.start,
      expiresAt: parsedQR.expiresAt
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'DAILY_GATE_ATTENDANCE_MARKED',
      entityType: 'Attendance',
      metadata: {
        date: activeWindows.dayRange.start,
        routineIds,
        markedSubjectIds: markedSubjects.map((subject) => subject.id)
      }
    })
  } catch (error) {
    res.internalError(error)
  }
}

const getLiveGateAttendanceQrPayload = async (req) => {
  await syncClosedRoutineAbsences()

  const now = new Date()
  const windows = await getActiveRoutineWindows(now)
  if (!windows.active.length) {
    return {
      active: false,
      dayOfWeek: windows.dayOfWeek,
      serverTime: now.toISOString(),
      nextWindow: windows.nextWindow
        ? {
            id: windows.nextWindow.id,
            subject: windows.nextWindow.subject,
            startTime: windows.nextWindow.startTime,
            endTime: windows.nextWindow.endTime,
            startsAt: windows.nextWindow.startsAt.toISOString(),
            scanClosesAt: windows.nextWindow.endsAt.toISOString()
          }
        : null
    }
  }

  const expiresAt = new Date(Math.min(
    now.getTime() + (60 * 1000),
    ...windows.active.map((routine) => routine.endsAt.getTime())
  ))

  const qrData = createSignedQrPayload({
    type: 'GATE_PERIOD',
    issuedBy: req.user.id,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    dayOfWeek: windows.dayOfWeek,
    routineIds: windows.active.map((routine) => routine.id)
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
    periods: windows.active.map((routine) => ({
      id: routine.id,
      subject: routine.subject,
      startTime: routine.startTime,
      endTime: routine.endTime,
      startsAt: routine.startsAt.toISOString(),
      scanClosesAt: routine.endsAt.toISOString()
    })),
    nextWindow: windows.nextWindow
      ? {
          id: windows.nextWindow.id,
          subject: windows.nextWindow.subject,
          startTime: windows.nextWindow.startTime,
          endTime: windows.nextWindow.endTime,
          startsAt: windows.nextWindow.startsAt.toISOString(),
          scanClosesAt: windows.nextWindow.endsAt.toISOString()
        }
      : null
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

// ================================
// GENERATE DAILY ENTRY QR (Gatekeeper)
// ================================
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

    res.json({
      message: 'Rotating gate attendance QR generated successfully!',
      ...payload
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'DAILY_GATE_QR_GENERATED',
      entityType: 'Attendance',
      metadata: {
        routineIds: payload.periods.map((period) => period.id),
        expiresAt: payload.expiresAt
      }
    })
  } catch (error) {
    res.internalError(error)
  }
}

const getMyAbsenceTickets = async (req, res) => {
  try {
    const student = req.student
    if (!student) {
      return res.status(403).json({ message: 'Student profile not found' })
    }

    await syncClosedRoutineAbsences()

    const [tickets, absencesWithoutTicket] = await Promise.all([
      prisma.absenceTicket.findMany({
        where: { studentId: student.id },
        include: {
          attendance: {
            include: {
              subject: { select: { id: true, name: true, code: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.attendance.findMany({
        where: {
          studentId: student.id,
          status: 'ABSENT',
          absenceTicket: null
        },
        include: {
          subject: { select: { id: true, name: true, code: true } }
        },
        orderBy: { date: 'desc' }
      })
    ])

    res.json({ tickets, absencesWithoutTicket })
  } catch (error) {
    res.internalError(error)
  }
}

const createAbsenceTicket = async (req, res) => {
  try {
    const student = req.student
    if (!student) {
      return res.status(403).json({ message: 'Student profile not found' })
    }

    const { attendanceId, reason } = req.body
    const attendance = await prisma.attendance.findFirst({
      where: {
        id: attendanceId,
        studentId: student.id,
        status: 'ABSENT'
      }
    })

    if (!attendance) {
      return res.status(404).json({ message: 'Absent attendance record not found' })
    }

    const existingTicket = await prisma.absenceTicket.findUnique({
      where: { attendanceId }
    })

    if (existingTicket) {
      return res.status(400).json({ message: 'A ticket already exists for this absence.' })
    }

    const ticket = await prisma.absenceTicket.create({
      data: {
        attendanceId,
        studentId: student.id,
        reason
      },
      include: {
        attendance: {
          include: {
            subject: { select: { id: true, name: true, code: true } }
          }
        }
      }
    })

    res.status(201).json({
      message: 'Absence ticket submitted successfully.',
      ticket
    })
  } catch (error) {
    res.internalError(error)
  }
}

const getAbsenceTicketsForStaff = async (req, res) => {
  try {
    const where = {}

    if (req.user.role === 'INSTRUCTOR') {
      if (!req.instructor) {
        return res.status(403).json({ message: 'Instructor profile not found' })
      }

      where.attendance = {
        instructorId: req.instructor.id
      }
    }

    if (req.user.role === 'COORDINATOR') {
      if (!req.coordinator?.department) {
        return res.status(403).json({ message: 'Coordinator department is not configured yet' })
      }

      where.attendance = {
        student: {
          department: req.coordinator.department
        }
      }
    }

    const tickets = await prisma.absenceTicket.findMany({
      where,
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true } }
          }
        },
        attendance: {
          include: {
            subject: { select: { id: true, name: true, code: true } }
          }
        }
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' }
      ]
    })

    res.json({ tickets })
  } catch (error) {
    res.internalError(error)
  }
}

const reviewAbsenceTicket = async (req, res) => {
  try {
    const { id } = req.params
    const { status, response } = req.body

    const existing = await prisma.absenceTicket.findUnique({
      where: { id },
      include: {
        attendance: {
          include: {
            student: true
          }
        }
      }
    })

    if (!existing) {
      return res.status(404).json({ message: 'Absence ticket not found' })
    }

    if (req.user.role === 'INSTRUCTOR' && existing.attendance.instructorId !== req.instructor?.id) {
      return res.status(403).json({ message: 'You can only review tickets for your own classes' })
    }

    if (req.user.role === 'COORDINATOR' && existing.attendance.student.department !== req.coordinator?.department) {
      return res.status(403).json({ message: 'You can only review tickets for your department' })
    }

    const ticket = await prisma.absenceTicket.update({
      where: { id },
      data: {
        status,
        response,
        reviewedBy: req.user.id,
        reviewedAt: new Date()
      }
    })

    res.json({
      message: 'Absence ticket reviewed successfully.',
      ticket
    })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = {
  generateDailyAttendanceQR,
  getLiveGateAttendanceQr,
  generateQR,
  markAttendanceQR,
  markDailyAttendanceQR,
  markAttendanceManual,
  getAttendanceBySubject,
  getCoordinatorDepartmentAttendanceReport,
  exportCoordinatorDepartmentAttendanceReport,
  getMonthlyAttendanceReport,
  exportAttendanceBySubject,
  getMyAttendance,
  getSubjectRoster,
  getMyAbsenceTickets,
  createAbsenceTicket,
  getAbsenceTicketsForStaff,
  reviewAbsenceTicket
}


