const prisma = require('../../utils/prisma')
const { recordAuditLog } = require('../../utils/audit')
const { signQrPayload, verifyQrPayload } = require('../../utils/qrSigning')
const { hashToken } = require('../../utils/token')

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE']
const QR_VALIDITY_MINUTES = 15
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const DEFAULT_ATTENDANCE_TIMEZONE = 'Asia/Kathmandu'
const formatterCache = new Map()

const getAttendanceTimezone = () => process.env.ATTENDANCE_TIMEZONE || process.env.TZ || DEFAULT_ATTENDANCE_TIMEZONE

const getFormatter = (cacheKey, options) => {
  if (!formatterCache.has(cacheKey)) {
    formatterCache.set(cacheKey, new Intl.DateTimeFormat('en-US', options))
  }

  return formatterCache.get(cacheKey)
}

const parseDateOnly = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return null
  }

  return {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10)
  }
}

const getZonedDateParts = (dateValue, timeZone) => {
  const formatter = getFormatter(`date:${timeZone}`, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const parts = formatter.formatToParts(dateValue)

  return {
    year: Number.parseInt(parts.find((part) => part.type === 'year')?.value || '', 10),
    month: Number.parseInt(parts.find((part) => part.type === 'month')?.value || '', 10),
    day: Number.parseInt(parts.find((part) => part.type === 'day')?.value || '', 10)
  }
}

const parseOffsetMinutes = (offsetValue) => {
  if (offsetValue === 'GMT' || offsetValue === 'UTC') {
    return 0
  }

  const match = offsetValue.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) {
    return 0
  }

  const sign = match[1] === '-' ? -1 : 1
  const hours = Number.parseInt(match[2], 10)
  const minutes = Number.parseInt(match[3] || '0', 10)
  return sign * ((hours * 60) + minutes)
}

const getTimeZoneOffsetMs = (dateValue, timeZone) => {
  const formatter = getFormatter(`offset:${timeZone}`, {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit'
  })
  const offsetValue = formatter
    .formatToParts(dateValue)
    .find((part) => part.type === 'timeZoneName')?.value || 'GMT'

  return parseOffsetMinutes(offsetValue) * 60 * 1000
}

const createZonedDate = (year, month, day, hours = 0, minutes = 0, seconds = 0, milliseconds = 0, timeZone = getAttendanceTimezone()) => {
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds)
  const firstOffset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone)
  let zonedDate = new Date(utcGuess - firstOffset)
  const correctedOffset = getTimeZoneOffsetMs(zonedDate, timeZone)

  if (correctedOffset !== firstOffset) {
    zonedDate = new Date(utcGuess - correctedOffset)
  }

  return zonedDate
}

const getDayRange = (dateValue) => {
  const timeZone = getAttendanceTimezone()
  const parsedDateOnly = parseDateOnly(dateValue)
  const baseDate = parsedDateOnly ? null : (dateValue ? new Date(dateValue) : new Date())

  if (!parsedDateOnly && Number.isNaN(baseDate.getTime())) {
    return null
  }

  const { year, month, day } = parsedDateOnly || getZonedDateParts(baseDate, timeZone)
  const start = createZonedDate(year, month, day, 0, 0, 0, 0, timeZone)
  const nextUtcDate = new Date(Date.UTC(year, month - 1, day + 1))
  const end = createZonedDate(
    nextUtcDate.getUTCFullYear(),
    nextUtcDate.getUTCMonth() + 1,
    nextUtcDate.getUTCDate(),
    0,
    0,
    0,
    0,
    timeZone
  )

  return { start, end }
}

const getMonthRange = (monthValue) => {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) {
    return null
  }

  const [year, month] = monthValue.split('-').map((value) => parseInt(value, 10))
  const timeZone = getAttendanceTimezone()
  const start = createZonedDate(year, month, 1, 0, 0, 0, 0, timeZone)

  if (Number.isNaN(start.getTime())) {
    return null
  }

  const end = month === 12
    ? createZonedDate(year + 1, 1, 1, 0, 0, 0, 0, timeZone)
    : createZonedDate(year, month + 1, 1, 0, 0, 0, 0, timeZone)

  return { start, end }
}

/**
 * Handles get owned subject business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getOwnedSubject = async (subjectId, context) => {
  const { user, instructor } = context
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

  if (user.role === 'COORDINATOR') {
    const coordinatorDepartments = [context.coordinator?.department].filter(Boolean)

    if (coordinatorDepartments.length === 0) {
      return { error: { status: 403, message: 'Coordinator department is not configured yet' } }
    }

    if (!subject.department || !coordinatorDepartments.includes(subject.department)) {
      return { error: { status: 403, message: 'You can only manage attendance for subjects in your department' } }
    }

    return { subject }
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

/**
 * Handles get subject students business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
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

const getCurrentDayName = (date = new Date()) => {
  const formatter = getFormatter(`weekday:${getAttendanceTimezone()}`, {
    timeZone: getAttendanceTimezone(),
    weekday: 'long'
  })
  const weekday = formatter.format(date).toUpperCase()
  return DAYS.includes(weekday) ? weekday : DAYS[date.getUTCDay()]
}

const buildDateWithTime = (baseDate, timeValue) => {
  const [hours, minutes] = timeValue.split(':').map((value) => parseInt(value, 10))
  const { year, month, day } = getZonedDateParts(baseDate, getAttendanceTimezone())
  return createZonedDate(year, month, day, hours, minutes, 0, 0, getAttendanceTimezone())
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

const respondAttendanceTicketUnavailable = (result) => (
  result.withStatus(503, {
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

/**
 * Handles get daily gate windows business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
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

/**
 * Handles get student scheduled routines for day business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
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
  return verifyQrPayload(qrData)?.payload || null
}

const createSignedQrPayload = (payload) => signQrPayload(payload)
const hashQrPayload = (qrData) => (typeof qrData === 'string' && qrData.trim() ? hashToken(qrData) : null)

/**
 * Handles get student by id card qr business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getStudentByIdCardQr = async (qrData) => {
  const parsedQr = parseQrPayload(qrData)
  if (!parsedQr || parsedQr.type !== 'STUDENT_ID_CARD' || !parsedQr.studentId) {
    return { error: { status: 400, message: 'Invalid student ID QR code' } }
  }

  const qrExpiresAt = new Date(parsedQr.expiresAt)
  if (
    typeof parsedQr.expiresAt !== 'string' ||
    Number.isNaN(qrExpiresAt.getTime()) ||
    new Date() >= qrExpiresAt
  ) {
    return { error: { status: 400, message: 'Student ID QR code has expired' } }
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

  if (parsedQr.semester !== student.semester) {
    return { error: { status: 400, message: 'Student ID QR code is no longer valid for the current semester' } }
  }

  return { student, parsedQr }
}

/**
 * Handles get student by roll number business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getStudentByRollNumber = async (rollNumber) => {
  const normalizedRollNumber = String(rollNumber || '').trim()
  if (!normalizedRollNumber) {
    return { error: { status: 400, message: 'Roll number is required' } }
  }

  const student = await prisma.student.findUnique({
    where: { rollNumber: normalizedRollNumber },
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

  return { student }
}

/**
 * Handles upsert present attendance for routines business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const upsertPresentAttendanceForRoutines = async ({ student, routines, attendanceDate, qrData, actorRole, actorId }) => {
  const qrCodeHash = hashQrPayload(qrData)
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
          qrCode: qrCodeHash
        },
        create: {
          studentId: student.id,
          subjectId: routine.subjectId,
          instructorId: routine.instructorId,
          status: 'PRESENT',
          qrCode: qrCodeHash,
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

/**
 * Handles get eligible gate attendance for student business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
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

/**
 * Handles sync closed routine absences business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
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

const formatDisplayDate = (dateValue) => {
  const formatter = getFormatter(`display:${getAttendanceTimezone()}`, {
    timeZone: getAttendanceTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  return formatter.format(new Date(dateValue))
}
const formatMonthLabel = (monthValue) => {
  const range = getMonthRange(monthValue)
  if (!range) return monthValue
  return range.start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: getAttendanceTimezone() })
}

/**
 * Handles get attendance export payload business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
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

/**
 * Handles get coordinator department report payload business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
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
  getAttendanceTimezone,
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
  hashQrPayload,
  getStudentByIdCardQr,
  getStudentByRollNumber,
  upsertPresentAttendanceForRoutines,
  getEligibleGateAttendanceForStudent,
  syncClosedRoutineAbsences,
  createZonedDate,
  formatDisplayDate,
  formatMonthLabel,
  getAttendanceExportPayload,
  getCoordinatorDepartmentReportPayload,
  recordAuditLog
}
