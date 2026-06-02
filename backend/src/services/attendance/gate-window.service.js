const prisma = require('../../utils/prisma')
const {
  getDayRange,
  getCurrentDayName,
  buildDateWithTime
} = require('./time.helpers')

const normalizeSemesterList = (semesters = []) => (
  [...new Set(
    semesters
      .map((value) => parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12)
  )].sort((left, right) => left - right)
)

const getDepartmentScope = (department) => (
  department
    ? [{ department: null }, { department: '' }, { department }]
    : [{ department: null }, { department: '' }]
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
      AND: [
        { OR: getDepartmentScope(student.department) },
        {
          OR: student.section
            ? [{ section: null }, { section: student.section }]
            : [{ section: null }, { section: '' }]
        }
      ],
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

  if (!studentDayRoutines.length) {
    return { error: { status: 400, message: 'This student has no scheduled subject today.' } }
  }

  return { gateDay, eligibleWindows, routines: studentDayRoutines }
}

const syncClosedRoutineAbsences = async (referenceDate = new Date()) => {
  const gateDay = await getDailyGateWindows(referenceDate)

  if (gateDay.holiday || !gateDay.windows.length) {
    return
  }

  const students = await prisma.student.findMany({
    where: {
      user: { isActive: true, deletedAt: null }
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

    const semesterRoutines = routines.filter((routine) => (
      routine.subject.enrollments.some((enrollment) => enrollment.studentId === student.id) &&
      routine.semester === student.semester &&
      (!routine.department || routine.department === student.department) &&
      (!routine.section || routine.section === student.section)
    ))

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

module.exports = {
  normalizeSemesterList,
  hasAbsenceTicketDelegate,
  respondAttendanceTicketUnavailable,
  getDailyGateWindows,
  getStudentScheduledRoutinesForDay,
  filterRoutinesForSemesterWindows,
  getEligibleGateAttendanceForStudent,
  syncClosedRoutineAbsences
}
