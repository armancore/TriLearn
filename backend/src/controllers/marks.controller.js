const prisma = require('../utils/prisma')

// ================================
// ADD MARKS (Instructor)
// ================================
const addMarks = async (req, res) => {
  try {
    const { studentId, subjectId, examType, totalMarks, obtainedMarks, remarks } = req.body

    const instructor = await prisma.instructor.findUnique({
      where: { userId: req.user.id }
    })

    if (!instructor) {
      return res.status(403).json({ message: 'Only instructors can add marks' })
    }

    const existing = await prisma.mark.findFirst({
      where: { studentId, subjectId, examType }
    })

    if (existing) {
      return res.status(400).json({ message: 'Marks already added for this exam type' })
    }

    const mark = await prisma.mark.create({
      data: {
        studentId,
        subjectId,
        instructorId: instructor.id,
        examType,
        totalMarks,
        obtainedMarks,
        remarks
      },
      include: {
        student: { include: { user: { select: { name: true } } } },
        subject: { select: { name: true, code: true } }
      }
    })

    res.status(201).json({ message: 'Marks added successfully!', mark })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// UPDATE MARKS (Instructor)
// ================================
const updateMarks = async (req, res) => {
  try {
    const { id } = req.params
    const { obtainedMarks, remarks } = req.body

    const mark = await prisma.mark.findUnique({ where: { id } })
    if (!mark) {
      return res.status(404).json({ message: 'Mark not found' })
    }

    const updated = await prisma.mark.update({
      where: { id },
      data: { obtainedMarks, remarks }
    })

    res.json({ message: 'Marks updated successfully!', mark: updated })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// GET MARKS BY SUBJECT (Instructor/Admin)
// ================================
const getMarksBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params
    const { examType } = req.query

    const filters = { subjectId }
    if (examType) filters.examType = examType

    const marks = await prisma.mark.findMany({
      where: filters,
      include: {
        student: { include: { user: { select: { name: true } } } },
        subject: { select: { name: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json({ total: marks.length, marks })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// GET MY MARKS (Student)
// ================================
const getMyMarks = async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user.id }
    })

    if (!student) {
      return res.status(403).json({ message: 'Only students can view their marks' })
    }

    const marks = await prisma.mark.findMany({
      where: { studentId: student.id },
      include: {
        subject: { select: { name: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Summary per subject
    const summary = {}
    marks.forEach(m => {
      const key = m.subject.name
      if (!summary[key]) {
        summary[key] = { subject: m.subject.name, code: m.subject.code, exams: [] }
      }
      summary[key].exams.push({
        examType: m.examType,
        obtained: m.obtainedMarks,
        total: m.totalMarks,
        percentage: ((m.obtainedMarks / m.totalMarks) * 100).toFixed(1) + '%'
      })
    })

    res.json({ marks, summary: Object.values(summary) })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// DELETE MARKS (Admin only)
// ================================
const deleteMarks = async (req, res) => {
  try {
    const { id } = req.params

    const mark = await prisma.mark.findUnique({ where: { id } })
    if (!mark) {
      return res.status(404).json({ message: 'Mark not found' })
    }

    await prisma.mark.delete({ where: { id } })

    res.json({ message: 'Mark deleted successfully!' })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

module.exports = {
  addMarks,
  updateMarks,
  getMarksBySubject,
  getMyMarks,
  deleteMarks
}