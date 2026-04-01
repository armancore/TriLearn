const prisma = require('../utils/prisma')
const logger = require('../utils/logger')

const getInstructorProfile = (userId) => prisma.instructor.findUnique({
  where: { userId }
})

const getManagedSubject = async (subjectId, user) => {
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
    const instructor = await getInstructorProfile(user.id)

    if (!instructor) {
      return { error: { status: 403, message: 'Only instructors can manage marks' } }
    }

    if (!subject.instructorId) {
      return { error: { status: 403, message: 'Assign an instructor to this subject before managing marks' } }
    }

    if (subject.instructorId !== instructor.id) {
      return { error: { status: 403, message: 'You can only manage marks for your assigned subjects' } }
    }

    return { subject, instructor }
  }

  return { subject }
}

// ================================
// ADD MARKS (Instructor)
// ================================
const addMarks = async (req, res) => {
  try {
    const { studentId, subjectId, examType, totalMarks, obtainedMarks, remarks } = req.body

    const access = await getManagedSubject(subjectId, req.user)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    const enrollment = await prisma.subjectEnrollment.findUnique({
      where: {
        subjectId_studentId: {
          subjectId,
          studentId
        }
      }
    })

    if (!enrollment) {
      return res.status(400).json({ message: 'Selected student is not enrolled in this subject' })
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
        instructorId: access.instructor.id,
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
    res.internalError(error)
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
    res.internalError(error)
  }
}

// ================================
// GET MARKS BY SUBJECT (Instructor/Admin)
// ================================
const getMarksBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params
    const { examType } = req.query

    const access = await getManagedSubject(subjectId, req.user)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

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

    res.json({ total: marks.length, marks, subject: access.subject })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET ENROLLED STUDENTS BY SUBJECT (Instructor/Admin)
// ================================
const getEnrolledStudentsBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params

    const access = await getManagedSubject(subjectId, req.user)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    const enrolledStudents = await prisma.subjectEnrollment.findMany({
      where: { subjectId },
      include: {
        student: {
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
        }
      },
      orderBy: {
        student: { rollNumber: 'asc' }
      }
    })

    const students = enrolledStudents
      .filter(({ student }) => student?.user?.isActive)
      .map(({ student }) => ({
        id: student.id,
        userId: student.user.id,
        name: student.user.name,
        email: student.user.email,
        rollNumber: student.rollNumber,
        semester: student.semester,
        section: student.section,
        department: student.department
      }))

    res.json({ total: students.length, students, subject: access.subject })

  } catch (error) {
    res.internalError(error)
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
    res.internalError(error)
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
    res.internalError(error)
  }
}

module.exports = {
  addMarks,
  updateMarks,
  getMarksBySubject,
  getEnrolledStudentsBySubject,
  getMyMarks,
  deleteMarks
}


