const prisma = require('../utils/prisma')

const applySectionScope = (studentSection) => (
  studentSection
    ? [{ section: null }, { section: studentSection }]
    : [{ section: null }, { section: '' }]
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
      OR: applySectionScope(student.section)
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

const validateRoutineAcademicScope = async ({ subjectId, instructorId, department, semester }) => {
  const subject = await prisma.subject.findUnique({ where: { id: subjectId } })
  if (!subject) return { error: { status: 404, message: 'Subject not found' } }

  const instructor = await prisma.instructor.findUnique({ where: { id: instructorId } })
  if (!instructor) return { error: { status: 404, message: 'Instructor not found' } }

  if (subject.semester !== semester) {
    return { error: { status: 400, message: 'Routine semester must match the selected subject semester.' } }
  }

  const normalizedDepartment = department || null
  const normalizedSubjectDepartment = subject.department || null

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
        OR: overlapConditions
      }
    ].filter(Boolean)
  }
}

const createRoutine = async (req, res) => {
  try {
    const { subjectId, instructorId, department, semester, section, dayOfWeek, startTime, endTime, room, combinedGroupId } = req.body

    const scope = await validateRoutineAcademicScope({ subjectId, instructorId, department, semester })
    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message })
    }

    const conflict = await prisma.routine.findFirst({
      where: getOverlapFilter({ dayOfWeek, startTime, endTime, section, room, department, semester, instructorId, combinedGroupId })
    })

    if (conflict) {
      if (room && conflict.room === room) {
        return res.status(400).json({ message: `Room ${room} is already booked at this time.` })
      }

      if (conflict.instructorId === instructorId) {
        return res.status(400).json({ message: 'This instructor already has a class at this time.' })
      }

      return res.status(400).json({ message: 'This time slot is already taken for this semester and section.' })
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
  } catch (error) {
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
    res.json({ routine })
  } catch (error) {
    res.internalError(error)
  }
}

const updateRoutine = async (req, res) => {
  try {
    const { id } = req.params
    const { subjectId, instructorId, department, semester, section, dayOfWeek, startTime, endTime, room, combinedGroupId } = req.body

    const routine = await prisma.routine.findUnique({ where: { id } })
    if (!routine) return res.status(404).json({ message: 'Routine not found' })

    const scope = await validateRoutineAcademicScope({ subjectId, instructorId, department, semester })
    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message })
    }

    const conflict = await prisma.routine.findFirst({
      where: getOverlapFilter({ dayOfWeek, startTime, endTime, section, room, department, semester, instructorId, combinedGroupId, excludeId: id })
    })

    if (conflict) {
      if (room && conflict.room === room) {
        return res.status(400).json({ message: `Room ${room} is already booked at this time.` })
      }

      if (conflict.instructorId === instructorId) {
        return res.status(400).json({ message: 'This instructor already has a class at this time.' })
      }

      return res.status(400).json({ message: 'This time slot is already taken for this semester and section.' })
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
  } catch (error) {
    res.internalError(error)
  }
}

const deleteRoutine = async (req, res) => {
  try {
    const { id } = req.params
    const routine = await prisma.routine.findUnique({ where: { id } })
    if (!routine) return res.status(404).json({ message: 'Routine not found' })

    await prisma.routine.delete({ where: { id } })
    res.json({ message: 'Routine deleted successfully!' })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = { createRoutine, getAllRoutines, getRoutineById, updateRoutine, deleteRoutine }
