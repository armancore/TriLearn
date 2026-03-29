const prisma = require('../utils/prisma')

// ================================
// CREATE SUBJECT
// ================================
const createSubject = async (req, res) => {
  try {
    const { name, code, description, semester, department, instructorId } = req.body

    const existingSubject = await prisma.subject.findUnique({
      where: { code }
    })

    if (existingSubject) {
      return res.status(400).json({ message: 'Subject code already exists' })
    }

    const subject = await prisma.subject.create({
      data: {
        name,
        code,
        description,
        semester,
        department,
        instructorId
      },
      include: { instructor: { include: { user: { select: { name: true, email: true } } } } }
    })

    res.status(201).json({
      message: 'Subject created successfully!',
      subject
    })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// GET ALL SUBJECTS
// ================================
const getAllSubjects = async (req, res) => {
  try {
    const { semester, department } = req.query

    const filters = {}
    if (semester) filters.semester = parseInt(semester)
    if (department) filters.department = department

    const subjects = await prisma.subject.findMany({
      where: filters,
      include: {
        instructor: {
          include: {
            user: { select: { name: true, email: true } }
          }
        },
        _count: {
          select: {
            assignments: true,
            materials: true,
            attendances: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json({ total: subjects.length, subjects })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// GET SUBJECT BY ID
// ================================
const getSubjectById = async (req, res) => {
  try {
    const { id } = req.params

    const subject = await prisma.subject.findUnique({
      where: { id },
      include: {
        instructor: {
          include: {
            user: { select: { name: true, email: true, phone: true } }
          }
        },
        _count: {
          select: {
            assignments: true,
            materials: true,
            attendances: true,
            marks: true
          }
        }
      }
    })

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' })
    }

    res.json({ subject })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// UPDATE SUBJECT
// ================================
const updateSubject = async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, semester, department, instructorId } = req.body

    const subject = await prisma.subject.findUnique({ where: { id } })
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' })
    }

    const updatedSubject = await prisma.subject.update({
      where: { id },
      data: { name, description, semester, department, instructorId },
      include: {
        instructor: {
          include: {
            user: { select: { name: true, email: true } }
          }
        }
      }
    })

    res.json({
      message: 'Subject updated successfully!',
      subject: updatedSubject
    })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// DELETE SUBJECT
// ================================
const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params

    const subject = await prisma.subject.findUnique({ where: { id } })
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' })
    }

    await prisma.subject.delete({ where: { id } })

    res.json({ message: 'Subject deleted successfully!' })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// ASSIGN INSTRUCTOR TO SUBJECT
// ================================
const assignInstructor = async (req, res) => {
  try {
    const { id } = req.params
    const { instructorId } = req.body

    const subject = await prisma.subject.findUnique({ where: { id } })
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' })
    }

    const instructor = await prisma.instructor.findUnique({
      where: { id: instructorId }
    })
    if (!instructor) {
      return res.status(404).json({ message: 'Instructor not found' })
    }

    const updatedSubject = await prisma.subject.update({
      where: { id },
      data: { instructorId },
      include: {
        instructor: {
          include: {
            user: { select: { name: true, email: true } }
          }
        }
      }
    })

    res.json({
      message: 'Instructor assigned successfully!',
      subject: updatedSubject
    })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

module.exports = {
  createSubject,
  getAllSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
  assignInstructor
}