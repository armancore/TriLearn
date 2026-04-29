const prisma = require('../utils/prisma')
const { createNotifications } = require('../utils/notifications')
const ensureCoordinatorDepartmentScope = async (req, res, departmentValue, message = 'You can only manage routines in your own department') => {
  if (req.user.role !== 'COORDINATOR') {
    return null
  }

  const coordinatorDepartments = [req.coordinator?.department].filter(Boolean)

  if (coordinatorDepartments.length === 0) {
    res.status(403).json({ message: 'Coordinator department is not configured yet' })
    return null
  }

  if (departmentValue && !coordinatorDepartments.includes(departmentValue)) {
    res.status(403).json({ message })
    return null
  }

  return coordinatorDepartments
}

const applySectionScope = (studentSection) => (
  studentSection
    ? [{ section: null }, { section: studentSection }]
    : undefined
)

const buildRoutineFilters = async (req) => {
  const { dayOfWeek, semester, department, section } = req.query
  const filters = {}

  if (dayOfWeek) filters.dayOfWeek = dayOfWeek
  if (semester) filters.semester = parseInt(semester, 10)
  if (department) filters.department = department
  if (section) filters.section = section

  if (req.user.role === 'INSTRUCTOR') {
    const instructor = await prisma.instructor.findUnique({
      where: { userId: req.user.id }
    })

    filters.instructorId = instructor?.id || '__no_routines__'
  }

  if (req.user.role === 'STUDENT') {
    const student = await prisma.student.findUnique({
      where: { userId: req.user.id }
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

  if (req.user.role === 'COORDINATOR') {
    const coordinatorDepartments = [req.coordinator?.department].filter(Boolean)

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

const validateRoutineAcademicScope = async ({ subjectId, instructorId, department, semester, req }) => {
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

  if (req?.user?.role === 'COORDINATOR') {
    const coordinatorDepartments = [req.coordinator?.department].filter(Boolean)

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

const respondToRoutineConflict = ({ res, conflict, room, instructorId }) => {
  if (room && conflict.room === room) {
    return res.status(400).json({ message: `Room ${room} is already booked at this time.` })
  }

  if (conflict.instructorId === instructorId) {
    return res.status(400).json({ message: 'This instructor already has a class at this time.' })
  }

  return res.status(400).json({ message: 'This time slot is already taken for this semester and section.' })
}

const createRoutine = async (req, res) => {
  try {
    const { subjectId, instructorId, department, semester, section, dayOfWeek, startTime, endTime, room, combinedGroupId } = req.body

    const scope = await validateRoutineAcademicScope({ req, subjectId, instructorId, department, semester })
    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message })
    }

    const conflict = await prisma.routine.findFirst({
      where: getOverlapFilter({ dayOfWeek, startTime, endTime, section, room, department, semester, instructorId, combinedGroupId })
    })

    if (conflict) {
      return respondToRoutineConflict({ res, conflict, room, instructorId })
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

    res.status(201).json({ message: 'Routine created successfully!', routine })

    void notifyRoutineCreated(routine).catch(() => null)
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(400).json({ message: 'This instructor already has a class at this time.' })
    }

    res.internalError(error)
  }
}

const getAllRoutines = async (req, res) => {
  try {
    const filters = await buildRoutineFilters(req)

    const routines = await prisma.routine.findMany({
      where: filters,
      include: getRoutineInclude(),
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    })

    res.json({ total: routines.length, routines })
  } catch (error) {
    res.internalError(error)
  }
}

const getRoutineById = async (req, res) => {
  try {
    const { id } = req.params
    const routine = await prisma.routine.findUnique({
      where: { id },
      include: getRoutineInclude()
    })
    if (!routine) return res.status(404).json({ message: 'Routine not found' })

    const departmentAllowed = await ensureCoordinatorDepartmentScope(req, res, routine.department)
    if (req.user.role === 'COORDINATOR' && !departmentAllowed) {
      return
    }

    res.json({ routine })
  } catch (error) {
    res.internalError(error)
  }
}

const updateRoutine = async (req, res) => {
  try {
    const { id } = req.params
    const { subjectId, instructorId, department, semester, section, dayOfWeek, startTime, endTime, room, combinedGroupId } = req.body

    const routine = await prisma.routine.findUnique({
      where: { id },
      include: getRoutineInclude()
    })
    if (!routine) return res.status(404).json({ message: 'Routine not found' })

    const departmentAllowed = await ensureCoordinatorDepartmentScope(req, res, routine.department)
    if (req.user.role === 'COORDINATOR' && !departmentAllowed) {
      return
    }

    const scope = await validateRoutineAcademicScope({ req, subjectId, instructorId, department, semester })
    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message })
    }

    const conflict = await prisma.routine.findFirst({
      where: getOverlapFilter({ dayOfWeek, startTime, endTime, section, room, department, semester, instructorId, combinedGroupId, excludeId: id })
    })

    if (conflict) {
      return respondToRoutineConflict({ res, conflict, room, instructorId })
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

    res.json({ message: 'Routine updated successfully!', routine: updated })

    if (routine.subjectId !== updated.subjectId) {
      void Promise.allSettled([
        notifyRoutineDeleted(routine),
        notifyRoutineCreated(updated)
      ])
    }
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(400).json({ message: 'This instructor already has a class at this time.' })
    }

    res.internalError(error)
  }
}

const deleteRoutine = async (req, res) => {
  try {
    const { id } = req.params
    const routine = await prisma.routine.findUnique({
      where: { id },
      include: getRoutineInclude()
    })
    if (!routine) return res.status(404).json({ message: 'Routine not found' })

    const departmentAllowed = await ensureCoordinatorDepartmentScope(req, res, routine.department)
    if (req.user.role === 'COORDINATOR' && !departmentAllowed) {
      return
    }

    await prisma.routine.delete({ where: { id } })
    res.json({ message: 'Routine deleted successfully!' })

    void notifyRoutineDeleted(routine).catch(() => null)
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = { createRoutine, getAllRoutines, getRoutineById, updateRoutine, deleteRoutine }
