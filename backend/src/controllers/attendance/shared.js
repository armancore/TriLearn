const prisma = require('../../utils/prisma')
const crypto = require('crypto')
const { recordAuditLog } = require('../../utils/audit')

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE']
const QR_VALIDITY_MINUTES = 15
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET

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

const getSubjectStudents = async (subject, filters = {}) => {
  const normalizedSemester = filters.semester ? parseInt(filters.semester, 10) : null
  const normalizedSection = filters.section ? String(filters.section).trim() : ''

  const students = await prisma.student.findMany({
    where: {
      user: { isActive: true },
      ...(normalizedSemester ? { semester: normalizedSemester } : {}),
      ...(normalizedSection ? { section: normalizedSection } : {}),
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

const buildDateWithTime = (baseDate, timeValue) => {
  const date = new Date(baseDate)
  const [hours, minutes] = timeValue.split(':').map((value) => parseInt(value, 10))
  date.setHours(hours, minutes, 0, 0)
  return date
}

const normalizeSemesterList = (semesters = []) => (
  [...new Set(
    semesters
      .map((value) => parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12)
  )].sort((left, right) => left - right)
)

const hasPrismaDelegateMethod = (delegate, methodName) => (
  Boolean(delegate && typeof delegate[methodName] === 'function')
)

const hasAbsenceTicketDelegate = () => hasPrismaDelegateMethod(prisma.absenceTicket, 'findMany')
const hasAttendanceHolidayDelegate = () => hasPrismaDelegateMethod(prisma.attendanceHoliday, 'findFirst')

const respondAttendanceTicketUnavailable = (res) => (
  res.status(503).json({
    message: 'Attendance tickets are not available yet. Run the latest Prisma generate and migrations for this feature.'
  })
)

const getGateWindowRange = (baseDate, gateWindow) => ({
  startsAt: buildDateWithTime(baseDate, gateWindow.startTime),
  endsAt: buildDateWithTime(baseDate, gateWindow.endTime)
})

const rangesOverlap = (leftStart, leftEnd, rightStart, rightEnd) => (
  leftStart < rightEnd && leftEnd > rightStart
)

const getHolidayForDate = async (referenceDate = new Date()) => {
  if (!hasAttendanceHolidayDelegate()) {
    return null
  }

  const dayRange = getDayRange(referenceDate)
  return prisma.attendanceHoliday.findFirst({
    where: {
      date: dayRange.start,
      isActive: true
    }
  })
}

const getDailyGateWindows = async (referenceDate = new Date()) => {
  const dayRange = getDayRange(referenceDate)
  const dayOfWeek = getCurrentDayName(dayRange.start)
  const holiday = await getHolidayForDate(dayRange.start)

  const windows = await prisma.gateScanWindow.findMany({
    where: {
      dayOfWeek,
      isActive: true
    },
    orderBy: { startTime: 'asc' }
  })

  const enrichedWindows = windows.map((window) => {
    const range = getGateWindowRange(dayRange.start, window)
    return {
      ...window,
      allowedSemesters: normalizeSemesterList(window.allowedSemesters),
      startsAt: range.startsAt,
      endsAt: range.endsAt
    }
  })

  const active = []
  let nextWindow = null
  const semesterCutoffMap = new Map()

  enrichedWindows.forEach((window) => {
    window.allowedSemesters.forEach((semester) => {
      const currentCutoff = semesterCutoffMap.get(semester)
      if (!currentCutoff || window.endsAt > currentCutoff) {
        semesterCutoffMap.set(semester, window.endsAt)
      }
    })

    if (referenceDate >= window.startsAt && referenceDate <= window.endsAt) {
      active.push(window)
      return
    }

    if (referenceDate < window.startsAt) {
      if (!nextWindow || window.startsAt < nextWindow.startsAt) {
        nextWindow = window
      }
    }
  })

  return {
    dayRange,
    dayOfWeek,
    holiday,
    windows: enrichedWindows,
    active,
    nextWindow,
    semesterCutoffMap
  }
}

const dedupeRoutinesBySubject = (routines) => {
  const routineMap = new Map()

  routines.forEach((routine) => {
    if (!routineMap.has(routine.subjectId)) {
      routineMap.set(routine.subjectId, routine)
    }
  })

  return [...routineMap.values()]
}

const getStudentScheduledRoutinesForDay = async ({ studentId, dayOfWeek }) => {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      semester: true,
      section: true,
      department: true
    }
  })

  if (!student) {
    return []
  }

  const routines = await prisma.routine.findMany({
    where: {
      dayOfWeek,
      semester: student.semester,
      department: student.department || null,
      OR: student.section
        ? [{ section: null }, { section: student.section }]
        : [{ section: null }, { section: '' }],
      subject: {
        enrollments: {
          some: {
            studentId
          }
        }
      }
    },
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

  return dedupeRoutinesBySubject(routines)
}

const filterRoutinesForSemesterWindows = ({ routines, baseDate, semester, windows }) => {
  if (!windows.length) {
    return []
  }

  return routines.filter((routine) => {
    const routineStart = buildDateWithTime(baseDate, routine.startTime)
    const routineEnd = buildDateWithTime(baseDate, routine.endTime)

    return windows.some((window) => (
      window.allowedSemesters.includes(semester) &&
      rangesOverlap(routineStart, routineEnd, window.startsAt, window.endsAt)
    ))
  })
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

const getStudentByIdCardQr = async (qrData) => {
  const parsedQr = parseQrPayload(qrData)
  if (!parsedQr || parsedQr.type !== 'STUDENT_ID_CARD' || !parsedQr.studentId) {
    return { error: { status: 400, message: 'Invalid student ID QR code' } }
  }

  const student = await prisma.student.findUnique({
    where: { id: parsedQr.studentId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true
        }
      }
    }
  })

  if (!student || !student.user?.isActive) {
    return { error: { status: 404, message: 'Student was not found or is inactive' } }
  }

  return { student, parsedQr }
}

const upsertPresentAttendanceForRoutines = async ({ student, routines, attendanceDate, qrData, actorRole, actorId }) => {
  const existingAttendance = await prisma.attendance.findMany({
    where: {
      studentId: student.id,
      subjectId: { in: routines.map((routine) => routine.subjectId) },
      date: { gte: attendanceDate.start, lt: attendanceDate.end }
    }
  })

  const existingMap = new Map(existingAttendance.map((record) => [record.subjectId, record]))
  const routinesToMark = routines.filter((routine) => !existingMap.has(routine.subjectId))

  if (!routinesToMark.length) {
    return { error: { status: 400, message: 'Attendance has already been recorded for the applicable class entries.' } }
  }

  const records = await prisma.$transaction(
    routinesToMark.map((routine) => (
      prisma.attendance.upsert({
        where: {
          studentId_subjectId_date: {
            studentId: student.id,
            subjectId: routine.subjectId,
            date: attendanceDate.start
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
          date: attendanceDate.start
        }
      })
    ))
  )

  await recordAuditLog({
    actorId,
    actorRole,
    action: 'STUDENT_ID_QR_ATTENDANCE_MARKED',
    entityType: 'Attendance',
    metadata: {
      studentId: student.id,
      subjectIds: records.map((record) => record.subjectId),
      date: attendanceDate.start
    }
  })

  return {
    records,
    markedSubjects: routinesToMark.map((routine) => ({
      id: routine.subjectId,
      name: routine.subject.name,
      code: routine.subject.code,
      startTime: routine.startTime,
      endTime: routine.endTime
    }))
  }
}

const getEligibleGateAttendanceForStudent = async (student, referenceDate = new Date()) => {
  const gateDay = await getDailyGateWindows(referenceDate)

  if (gateDay.holiday) {
    return { error: { status: 400, message: `Today is marked as a holiday: ${gateDay.holiday.title}` } }
  }

  const eligibleWindows = gateDay.active.filter((window) => window.allowedSemesters.includes(student.semester))

  if (!eligibleWindows.length) {
    return { error: { status: 400, message: 'There is no active Student QR time slot for this student right now.' } }
  }

  const studentDayRoutines = await getStudentScheduledRoutinesForDay({
    studentId: student.id,
    dayOfWeek: gateDay.dayOfWeek
  })

  const routines = filterRoutinesForSemesterWindows({
    routines: studentDayRoutines,
    baseDate: gateDay.dayRange.start,
    semester: student.semester,
    windows: eligibleWindows
  })

  if (!routines.length) {
    return { error: { status: 400, message: 'This student has no scheduled subject in the active Student QR time slot.' } }
  }

  return { gateDay, eligibleWindows, routines }
}

const syncClosedRoutineAbsences = async (referenceDate = new Date()) => {
  const gateDay = await getDailyGateWindows(referenceDate)

  if (gateDay.holiday || !gateDay.windows.length) {
    return
  }

  const students = await prisma.student.findMany({
    where: {
      user: { isActive: true }
    },
    select: {
      id: true,
      semester: true,
      department: true,
      section: true
    }
  })

  if (!students.length) {
    return
  }

  const routines = dedupeRoutinesBySubject(await prisma.routine.findMany({
    where: {
      dayOfWeek: gateDay.dayOfWeek
    },
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
  }))

  if (!routines.length) {
    return
  }

  const subjectIds = routines.map((routine) => routine.subjectId)
  const existingAttendance = await prisma.attendance.findMany({
    where: {
      subjectId: { in: subjectIds },
      date: { gte: gateDay.dayRange.start, lt: gateDay.dayRange.end }
    },
    select: {
      studentId: true,
      subjectId: true
    }
  })

  const existingKeys = new Set(existingAttendance.map((record) => `${record.studentId}:${record.subjectId}`))
  const absencesToCreate = []

  students.forEach((student) => {
    const closedWindowsForSemester = gateDay.windows.filter((window) => (
      window.allowedSemesters.includes(student.semester) &&
      referenceDate > window.endsAt
    ))

    if (!closedWindowsForSemester.length) {
      return
    }

    const semesterRoutines = filterRoutinesForSemesterWindows({
      routines: routines.filter((routine) => (
        routine.subject.enrollments.some((enrollment) => enrollment.studentId === student.id) &&
        routine.semester === student.semester &&
        (routine.department || null) === (student.department || null) &&
        (!routine.section || routine.section === student.section)
      )),
      baseDate: gateDay.dayRange.start,
      semester: student.semester,
      windows: closedWindowsForSemester
    })

    semesterRoutines.forEach((routine) => {
      const key = `${student.id}:${routine.subjectId}`
      if (existingKeys.has(key)) {
        return
      }

      existingKeys.add(key)
      absencesToCreate.push({
        studentId: student.id,
        subjectId: routine.subjectId,
        instructorId: routine.instructorId,
        status: 'ABSENT',
        date: gateDay.dayRange.start
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

const formatDisplayDate = (dateValue) => new Date(dateValue).toLocaleDateString('en-CA')
const formatMonthLabel = (monthValue) => {
  const range = getMonthRange(monthValue)
  if (!range) return monthValue
  return range.start.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

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

module.exports = {
  ATTENDANCE_STATUSES,
  QR_VALIDITY_MINUTES,
  prisma,
  getDayRange,
  getMonthRange,
  getOwnedSubject,
  getSubjectStudents,
  buildAttendanceSummary,
  buildStatusSummary,
  getCurrentDayName,
  buildDateWithTime,
  normalizeSemesterList,
  hasAbsenceTicketDelegate,
  respondAttendanceTicketUnavailable,
  getDailyGateWindows,
  getStudentScheduledRoutinesForDay,
  filterRoutinesForSemesterWindows,
  parseQrPayload,
  createSignedQrPayload,
  getStudentByIdCardQr,
  upsertPresentAttendanceForRoutines,
  getEligibleGateAttendanceForStudent,
  syncClosedRoutineAbsences,
  formatDisplayDate,
  formatMonthLabel,
  getAttendanceExportPayload,
  getCoordinatorDepartmentReportPayload,
  recordAuditLog
}
