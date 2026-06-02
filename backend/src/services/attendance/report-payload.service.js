const prisma = require('../../utils/prisma')
const {
  getDayRange,
  getMonthRange,
  formatDisplayDate,
  formatMonthLabel
} = require('./time.helpers')
const {
  getOwnedSubject,
  buildAttendanceSummary,
  buildStatusSummary
} = require('./subject.helpers')

const getAttendanceExportPayload = async ({ subjectId, date, month, context }) => {
  const access = await getOwnedSubject(subjectId, context)
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
    user: { isActive: true, deletedAt: null }
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

module.exports = {
  getAttendanceExportPayload,
  getCoordinatorDepartmentReportPayload
}
