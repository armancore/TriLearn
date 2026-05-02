/* eslint-disable no-useless-catch */
const { createServiceResponder } = require('../utils/serviceResult')
const prisma = require('../utils/prisma')
const { createNotifications } = require('../utils/notifications')
const ensureCoordinatorDepartmentScope = async (context, result, departmentValue, message = 'You can only manage routines in your own department') => {
  if (context.user.role !== 'COORDINATOR') {
    return null
  }

  const coordinatorDepartments = [context.coordinator?.department].filter(Boolean)

  if (coordinatorDepartments.length === 0) {
    result.withStatus(403, { message: 'Coordinator department is not configured yet' })
    return null
  }

  if (departmentValue && !coordinatorDepartments.includes(departmentValue)) {
    result.withStatus(403, { message })
    return null
  }

  return coordinatorDepartments
}

const applySectionScope = (studentSection) => (
  studentSection
    ? [{ section: null }, { section: studentSection }]
    : undefined
)

const buildRoutineFilters = async (context) => {
  const { dayOfWeek, semester, department, section } = context.query
  const filters = {}

  if (dayOfWeek) filters.dayOfWeek = dayOfWeek
  if (semester) filters.semester = parseInt(semester, 10)
  if (department) filters.department = department
  if (section) filters.section = section

  if (context.user.role === 'INSTRUCTOR') {
    const instructor = await prisma.instructor.findUnique({
      where: { userId: context.user.id }
    })

    filters.instructorId = instructor?.id || '__no_routines__'
  }

  if (context.user.role === 'STUDENT') {
    const student = await prisma.student.findUnique({
      where: { userId: context.user.id }
    })

    if (!student) {
      return { id: '__no_routines__' }
    }

    return {
      ...filters,
      department: student.department || filters.department,
      semester: student.semester,
      ...(applySectionScope(student.section) ? { OR: applySectionScope(student.section) } : {})
    }
  }

  if (context.user.role === 'COORDINATOR') {
    const coordinatorDepartments = [context.coordinator?.department].filter(Boolean)

    if (coordinatorDepartments.length === 0) {
      return { id: '__no_routines__' }
    }

    return {
      AND: [
        filters,
        {
          department: {
            in: coordinatorDepartments
          }
        }
      ]
    }
  }

  return filters
}

const getRoutineInclude = () => ({
  subject: {
    select: {
      id: true,
      name: true,
      code: true,
      semester: true,
      department: true
    }
  },
  instructor: {
    include: {
      user: {
        select: { name: true }
      }
    }
  }
})

const getRoutineNotificationRecipients = async ({ department, semester, section, instructorId }) => {
  const [students, instructor, coordinators] = await Promise.all([
    prisma.student.findMany({
      where: {
        semester,
        ...(department ? { department } : {}),
        ...(section ? { section } : {}),
        user: {
          isActive: true
        }
      },
      select: {
        userId: true
      }
    }),
    prisma.instructor.findUnique({
      where: { id: instructorId },
      select: { userId: true }
    }),
    department
      ? prisma.coordinator.findMany({
          where: {
            department,
            user: {
              isActive: true
            }
          },
          select: { userId: true }
        })
      : Promise.resolve([])
  ])

  return [...new Set([
    ...students.map((student) => student.userId),
    ...coordinators.map((coordinator) => coordinator.userId),
    instructor?.userId
  ].filter(Boolean))]
}

const getRoutineAudienceLabel = ({ department, semester, section }) => {
  const scope = section ? `Section ${section}` : 'All Sections'
  return `${department || 'General'} • Semester ${semester} • ${scope}`
}

const notifyRoutineCreated = async (routine) => {
  const recipients = await getRoutineNotificationRecipients({
    department: routine.department,
    semester: routine.semester,
    section: routine.section,
    instructorId: routine.instructorId
  })

  if (!recipients.length) {
    return
  }

  await createNotifications({
    userIds: recipients,
    type: 'ROUTINE_UPDATED',
    title: 'Subject added to routine',
    message: `${routine.subject?.name || 'A subject'} (${routine.subject?.code || 'N/A'}) was added on ${routine.dayOfWeek} ${routine.startTime}-${routine.endTime} for ${getRoutineAudienceLabel(routine)}.`,
    link: '/routine',
    metadata: {
      event: 'ROUTINE_CREATED',
      routineId: routine.id,
      subjectId: routine.subjectId,
      department: routine.department || null,
      semester: routine.semester,
      section: routine.section || null,
      dayOfWeek: routine.dayOfWeek,
      startTime: routine.startTime,
      endTime: routine.endTime
    },
    dedupeKeyFactory: (userId) => `routine-created:${routine.combinedGroupId || routine.id}:${userId}`
  })
}

const notifyRoutineDeleted = async (routine) => {
  const recipients = await getRoutineNotificationRecipients({
    department: routine.department,
    semester: routine.semester,
    section: routine.section,
    instructorId: routine.instructorId
  })

  if (!recipients.length) {
    return
  }

  await createNotifications({
    userIds: recipients,
    type: 'ROUTINE_UPDATED',
    title: 'Subject removed from routine',
    message: `${routine.subject?.name || 'A subject'} (${routine.subject?.code || 'N/A'}) was removed from ${routine.dayOfWeek} ${routine.startTime}-${routine.endTime} for ${getRoutineAudienceLabel(routine)}.`,
    link: '/routine',
    metadata: {
      event: 'ROUTINE_DELETED',
      routineId: routine.id,
      subjectId: routine.subjectId,
      department: routine.department || null,
      semester: routine.semester,
      section: routine.section || null,
      dayOfWeek: routine.dayOfWeek,
      startTime: routine.startTime,
      endTime: routine.endTime
    },
    dedupeKeyFactory: (userId) => `routine-deleted:${routine.id}:${userId}`
  })
}

const validateRoutineAcademicScope = async ({ subjectId, instructorId, department, semester, context }) => {
  const subject = await prisma.subject.findUnique({ where: { id: subjectId } })
  if (!subject) return { error: { status: 404, message: 'Subject not found' } }

  const instructor = await prisma.instructor.findUnique({
    where: { id: instructorId },
    select: {
      id: true,
      department: true,
      departmentMemberships: {
        include: {
          department: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  })
  if (!instructor) return { error: { status: 404, message: 'Instructor not found' } }

  if (subject.semester !== semester) {
    return { error: { status: 400, message: 'Routine semester must match the selected subject semester.' } }
  }

  const normalizedDepartment = department || null
  const normalizedSubjectDepartment = subject.department || null

  if (context?.user?.role === 'COORDINATOR') {
    const coordinatorDepartments = [context.coordinator?.department].filter(Boolean)

    if (coordinatorDepartments.length === 0) {
      return { error: { status: 403, message: 'Coordinator department is not configured yet' } }
    }

    if (
      (normalizedDepartment && !coordinatorDepartments.includes(normalizedDepartment)) ||
      (normalizedSubjectDepartment && !coordinatorDepartments.includes(normalizedSubjectDepartment))
    ) {
      return { error: { status: 403, message: 'You can only manage routines in your own department' } }
    }
  }

  if (normalizedDepartment !== normalizedSubjectDepartment) {
    return { error: { status: 400, message: 'Routine department must match the selected subject department.' } }
  }

  return { subject, instructor }
}

const getOverlapFilter = ({ dayOfWeek, startTime, endTime, section, room, department, semester, instructorId, combinedGroupId, excludeId }) => {
  const overlapConditions = [
    { startTime: { lte: startTime }, endTime: { gt: startTime } },
    { startTime: { lt: endTime }, endTime: { gte: endTime } },
    { startTime: { gte: startTime }, endTime: { lte: endTime } }
  ]

  return {
    dayOfWeek,
    id: excludeId ? { not: excludeId } : undefined,
    OR: [
      room
        ? {
            room,
            combinedGroupId: combinedGroupId ? { not: combinedGroupId } : undefined,
            OR: overlapConditions
          }
        : null,
      {
        department: department || null,
        semester,
        section: section || null,
        OR: overlapConditions
      },
      {
        instructorId,
        combinedGroupId: combinedGroupId ? { not: combinedGroupId } : undefined,
        OR: overlapConditions
      }
    ].filter(Boolean)
  }
}

const respondToRoutineConflict = ({ result, conflict, room, instructorId }) => {
  if (room && conflict.room === room) {
    return result.withStatus(400, { message: `Room ${room} is already booked at this time.` })
  }

  if (conflict.instructorId === instructorId) {
    return result.withStatus(400, { message: 'This instructor already has a class at this time.' })
  }

  return result.withStatus(400, { message: 'This time slot is already taken for this semester and section.' })
}

/**
 * Handles create routine business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createRoutine = async (context, result = createServiceResponder()) => {
  try {
    const { subjectId, instructorId, department, semester, section, dayOfWeek, startTime, endTime, room, combinedGroupId } = context.body

    const scope = await validateRoutineAcademicScope({ context, subjectId, instructorId, department, semester })
    if (scope.error) {
      return result.withStatus(scope.error.status, { message: scope.error.message })
    }

    const conflict = await prisma.routine.findFirst({
      where: getOverlapFilter({ dayOfWeek, startTime, endTime, section, room, department, semester, instructorId, combinedGroupId })
    })

    if (conflict) {
      return respondToRoutineConflict({ result, conflict, room, instructorId })
    }

    const routine = await prisma.routine.create({
      data: {
        subjectId,
        instructorId,
        department: department || null,
        semester,
        section: section || null,
        dayOfWeek,
        startTime,
        endTime,
        room: room || null,
        combinedGroupId: combinedGroupId || null
      },
      include: getRoutineInclude()
    })

    result.withStatus(201, { message: 'Routine created successfully!', routine })

    void notifyRoutineCreated(routine).catch(() => null)
  } catch (error) {
    if (error?.code === 'P2002') {
      return result.withStatus(400, { message: 'This instructor already has a class at this time.' })
    }

    throw error
  }
}

/**
 * Handles get all routines business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAllRoutines = async (context, result = createServiceResponder()) => {
  try {
    const filters = await buildRoutineFilters(context)

    const routines = await prisma.routine.findMany({
      where: filters,
      include: getRoutineInclude(),
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    })

    result.ok({ total: routines.length, routines })
  } catch (error) {
    throw error
  }
}

/**
 * Handles get routine by id business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getRoutineById = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params
    const routine = await prisma.routine.findUnique({
      where: { id },
      include: getRoutineInclude()
    })
    if (!routine) return result.withStatus(404, { message: 'Routine not found' })

    const departmentAllowed = await ensureCoordinatorDepartmentScope(context, result, routine.department)
    if (context.user.role === 'COORDINATOR' && !departmentAllowed) {
      return
    }

    result.ok({ routine })
  } catch (error) {
    throw error
  }
}

/**
 * Handles update routine business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const updateRoutine = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params
    const { subjectId, instructorId, department, semester, section, dayOfWeek, startTime, endTime, room, combinedGroupId } = context.body

    const routine = await prisma.routine.findUnique({
      where: { id },
      include: getRoutineInclude()
    })
    if (!routine) return result.withStatus(404, { message: 'Routine not found' })

    const departmentAllowed = await ensureCoordinatorDepartmentScope(context, result, routine.department)
    if (context.user.role === 'COORDINATOR' && !departmentAllowed) {
      return
    }

    const scope = await validateRoutineAcademicScope({ context, subjectId, instructorId, department, semester })
    if (scope.error) {
      return result.withStatus(scope.error.status, { message: scope.error.message })
    }

    const conflict = await prisma.routine.findFirst({
      where: getOverlapFilter({ dayOfWeek, startTime, endTime, section, room, department, semester, instructorId, combinedGroupId, excludeId: id })
    })

    if (conflict) {
      return respondToRoutineConflict({ result, conflict, room, instructorId })
    }

    const updated = await prisma.routine.update({
      where: { id },
      data: {
        subjectId,
        instructorId,
        department: department || null,
        semester,
        section: section || null,
        dayOfWeek,
        startTime,
        endTime,
        room: room || null,
        combinedGroupId: combinedGroupId || null
      },
      include: getRoutineInclude()
    })

    result.ok({ message: 'Routine updated successfully!', routine: updated })

    if (routine.subjectId !== updated.subjectId) {
      void Promise.allSettled([
        notifyRoutineDeleted(routine),
        notifyRoutineCreated(updated)
      ])
    }
  } catch (error) {
    if (error?.code === 'P2002') {
      return result.withStatus(400, { message: 'This instructor already has a class at this time.' })
    }

    throw error
  }
}

/**
 * Handles delete routine business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteRoutine = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params
    const routine = await prisma.routine.findUnique({
      where: { id },
      include: getRoutineInclude()
    })
    if (!routine) return result.withStatus(404, { message: 'Routine not found' })

    const departmentAllowed = await ensureCoordinatorDepartmentScope(context, result, routine.department)
    if (context.user.role === 'COORDINATOR' && !departmentAllowed) {
      return
    }

    await prisma.routine.delete({ where: { id } })
    result.ok({ message: 'Routine deleted successfully!' })

    void notifyRoutineDeleted(routine).catch(() => null)
  } catch (error) {
    throw error
  }
}

module.exports = { createRoutine, getAllRoutines, getRoutineById, updateRoutine, deleteRoutine }
