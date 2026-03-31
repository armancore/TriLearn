const prisma = require('../utils/prisma')

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
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// GET ALL ROUTINES
// ================================
const getAllRoutines = async (req, res) => {
  try {
    const { dayOfWeek, semester } = req.query

    const filters = {}
    if (dayOfWeek) filters.dayOfWeek = dayOfWeek
    if (semester) {
      filters.subject = { semester: parseInt(semester) }
    }

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
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
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
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
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
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
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
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

module.exports = { createRoutine, getAllRoutines, getRoutineById, updateRoutine, deleteRoutine }