const prisma = require('../utils/prisma')
const logger = require('../utils/logger')

const buildRoutineFilters = async (req) => {
  const { dayOfWeek, semester } = req.query
  const filters = {}

  if (dayOfWeek) filters.dayOfWeek = dayOfWeek
  if (semester) {
    filters.subject = { semester: parseInt(semester, 10) }
  }

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

    filters.subject = {
      ...(filters.subject || {}),
      enrollments: {
        some: {
          studentId: student?.id || '__no_student__'
        }
      }
    }
  }

  return filters
}

// ================================
// CREATE ROUTINE (Admin)
// ================================
const createRoutine = async (req, res) => {
  try {
    const { subjectId, instructorId, dayOfWeek, startTime, endTime, room } = req.body

    const subject = await prisma.subject.findUnique({ where: { id: subjectId } })
    if (!subject) return res.status(404).json({ message: 'Subject not found' })

    const instructor = await prisma.instructor.findUnique({ where: { id: instructorId } })
    if (!instructor) return res.status(404).json({ message: 'Instructor not found' })

    // Check for time conflict on same day/room
    if (room) {
      const conflict = await prisma.routine.findFirst({
        where: {
          dayOfWeek,
          room,
          OR: [
            { startTime: { lte: startTime }, endTime: { gt: startTime } },
            { startTime: { lt: endTime }, endTime: { gte: endTime } },
            { startTime: { gte: startTime }, endTime: { lte: endTime } },
          ]
        }
      })
      if (conflict) {
        return res.status(400).json({ message: 'Room is already booked at this time' })
      }
    }

    const routine = await prisma.routine.create({
      data: { subjectId, instructorId, dayOfWeek, startTime, endTime, room },
      include: {
        subject: { select: { name: true, code: true } },
        instructor: { include: { user: { select: { name: true } } } }
      }
    })

    res.status(201).json({ message: 'Routine created successfully!', routine })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET ALL ROUTINES
// ================================
const getAllRoutines = async (req, res) => {
  try {
    const filters = await buildRoutineFilters(req)

    const routines = await prisma.routine.findMany({
      where: filters,
      include: {
        subject: { select: { name: true, code: true, semester: true, department: true } },
        instructor: { include: { user: { select: { name: true } } } }
      },
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

// ================================
// GET ROUTINE BY ID
// ================================
const getRoutineById = async (req, res) => {
  try {
    const { id } = req.params
    const routine = await prisma.routine.findUnique({
      where: { id },
      include: {
        subject: { select: { name: true, code: true, semester: true } },
        instructor: { include: { user: { select: { name: true } } } }
      }
    })
    if (!routine) return res.status(404).json({ message: 'Routine not found' })
    res.json({ routine })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// UPDATE ROUTINE (Admin)
// ================================
const updateRoutine = async (req, res) => {
  try {
    const { id } = req.params
    const { subjectId, instructorId, dayOfWeek, startTime, endTime, room } = req.body

    const routine = await prisma.routine.findUnique({ where: { id } })
    if (!routine) return res.status(404).json({ message: 'Routine not found' })

    const updated = await prisma.routine.update({
      where: { id },
      data: { subjectId, instructorId, dayOfWeek, startTime, endTime, room },
      include: {
        subject: { select: { name: true, code: true } },
        instructor: { include: { user: { select: { name: true } } } }
      }
    })

    res.json({ message: 'Routine updated successfully!', routine: updated })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// DELETE ROUTINE (Admin)
// ================================
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


