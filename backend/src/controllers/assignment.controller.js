const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const { buildUploadedFileUrl } = require('../utils/fileStorage')

const resolveAssignmentManager = async (user, subjectId) => {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId }
  })

  if (!subject) {
    return { error: { status: 404, message: 'Subject not found' } }
  }

  if (user.role === 'COORDINATOR' || user.role === 'ADMIN') {
    if (!subject.instructorId) {
      return { error: { status: 400, message: 'Assign an instructor to this subject before managing assignments' } }
    }

    return { subject, instructorId: subject.instructorId }
  }

  const instructor = await prisma.instructor.findUnique({
    where: { userId: user.id }
  })

  if (!instructor) {
    return { error: { status: 403, message: 'Only instructors can manage assignments' } }
  }

  return { subject, instructorId: instructor.id }
}

// ================================
// CREATE ASSIGNMENT
// ================================
const createAssignment = async (req, res) => {
  try {
    const { title, description, subjectId, dueDate, totalMarks } = req.body
    const questionPdfUrl = buildUploadedFileUrl(req.file)
    const parsedTotalMarks = totalMarks ? parseInt(totalMarks, 10) : 100

    if (!questionPdfUrl) {
      return res.status(400).json({ message: 'Please upload the assignment question PDF' })
    }

    if (Number.isNaN(parsedTotalMarks) || parsedTotalMarks <= 0) {
      return res.status(400).json({ message: 'Total marks must be a valid positive number' })
    }

    const access = await resolveAssignmentManager(req.user, subjectId)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        questionPdfUrl,
        subjectId,
        instructorId: access.instructorId,
        dueDate: new Date(dueDate),
        totalMarks: parsedTotalMarks
      },
      include: {
        subject: { select: { name: true, code: true } },
        instructor: { include: { user: { select: { name: true } } } }
      }
    })

    res.status(201).json({
      message: 'Assignment created successfully!',
      assignment
    })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET ALL ASSIGNMENTS
// ================================
const getAllAssignments = async (req, res) => {
  try {
    const { subjectId } = req.query

    const filters = {}
    if (subjectId) filters.subjectId = subjectId

    if (req.user.role === 'INSTRUCTOR') {
      const instructor = await prisma.instructor.findUnique({
        where: { userId: req.user.id }
      })
      filters.instructorId = instructor?.id || '__no_assignments__'
    }

    const assignments = await prisma.assignment.findMany({
      where: filters,
      include: {
        subject: { select: { name: true, code: true } },
        instructor: { include: { user: { select: { name: true } } } },
        _count: { select: { submissions: true } }
      },
      orderBy: { dueDate: 'asc' }
    })

    res.json({ total: assignments.length, assignments })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET ASSIGNMENT BY ID
// ================================
const getAssignmentById = async (req, res) => {
  try {
    const { id } = req.params

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        subject: { select: { name: true, code: true } },
        instructor: { include: { user: { select: { name: true } } } },
        submissions: {
          include: {
            student: { include: { user: { select: { name: true } } } }
          }
        }
      }
    })

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' })
    }

    res.json({ assignment })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// UPDATE ASSIGNMENT
// ================================
const updateAssignment = async (req, res) => {
  try {
    const { id } = req.params
    const { title, description, dueDate, totalMarks } = req.body
    const questionPdfUrl = buildUploadedFileUrl(req.file)
    const parsedTotalMarks = totalMarks !== undefined ? parseInt(totalMarks, 10) : undefined

    const assignment = await prisma.assignment.findUnique({ where: { id } })
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' })
    }

    if (parsedTotalMarks !== undefined && (Number.isNaN(parsedTotalMarks) || parsedTotalMarks <= 0)) {
      return res.status(400).json({ message: 'Total marks must be a valid positive number' })
    }

    if (req.user.role === 'INSTRUCTOR') {
      const instructor = await prisma.instructor.findUnique({
        where: { userId: req.user.id }
      })

      if (assignment.instructorId !== instructor?.id) {
        return res.status(403).json({ message: 'You can only update your own assignments' })
      }
    }

    const updated = await prisma.assignment.update({
      where: { id },
      data: {
        title,
        description,
        questionPdfUrl: questionPdfUrl || assignment.questionPdfUrl,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        totalMarks: parsedTotalMarks
      }
    })

    res.json({ message: 'Assignment updated successfully!', assignment: updated })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// DELETE ASSIGNMENT
// ================================
const deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params

    const assignment = await prisma.assignment.findUnique({ where: { id } })
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' })
    }

    if (req.user.role === 'INSTRUCTOR') {
      const instructor = await prisma.instructor.findUnique({
        where: { userId: req.user.id }
      })

      if (assignment.instructorId !== instructor?.id) {
        return res.status(403).json({ message: 'You can only delete your own assignments' })
      }
    }

    await prisma.assignment.delete({ where: { id } })

    res.json({ message: 'Assignment deleted successfully!' })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// SUBMIT ASSIGNMENT
// ================================
const submitAssignment = async (req, res) => {
  try {
    const { id } = req.params
    const { note } = req.body
    const fileUrl = buildUploadedFileUrl(req.file)

    const student = await prisma.student.findUnique({
      where: { userId: req.user.id }
    })

    if (!student) {
      return res.status(403).json({ message: 'Only students can submit assignments' })
    }

    const assignment = await prisma.assignment.findUnique({ where: { id } })
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' })
    }

    const existingSubmission = await prisma.submission.findFirst({
      where: { assignmentId: id, studentId: student.id }
    })

    if (existingSubmission) {
      return res.status(400).json({ message: 'You have already submitted this assignment' })
    }

    if (!fileUrl) {
      return res.status(400).json({ message: 'Please upload your answer PDF' })
    }

    const isLate = new Date() > new Date(assignment.dueDate)

    const submission = await prisma.submission.create({
      data: {
        assignmentId: id,
        studentId: student.id,
        note,
        fileUrl,
        status: isLate ? 'LATE' : 'SUBMITTED'
      },
      include: {
        assignment: { select: { title: true, dueDate: true } },
        student: { include: { user: { select: { name: true } } } }
      }
    })

    res.status(201).json({
      message: isLate ? 'Assignment submitted late!' : 'Assignment submitted successfully!',
      submission
    })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET MY SUBMISSIONS
// ================================
const getMySubmissions = async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user.id }
    })

    if (!student) {
      return res.status(403).json({ message: 'Only students can view submissions' })
    }

    const submissions = await prisma.submission.findMany({
      where: { studentId: student.id },
      include: {
        assignment: {
          include: {
            subject: { select: { name: true, code: true } }
          }
        }
      },
      orderBy: { submittedAt: 'desc' }
    })

    res.json({ total: submissions.length, submissions })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GRADE SUBMISSION
// ================================
const gradeSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params
    const { obtainedMarks } = req.body

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assignment: true }
    })

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' })
    }

    if (req.user.role === 'INSTRUCTOR') {
      const instructor = await prisma.instructor.findUnique({
        where: { userId: req.user.id }
      })

      if (submission.assignment.instructorId !== instructor?.id) {
        return res.status(403).json({ message: 'You can only grade submissions for your own assignments' })
      }
    }

    if (obtainedMarks > submission.assignment.totalMarks) {
      return res.status(400).json({
        message: `Marks cannot exceed total marks (${submission.assignment.totalMarks})`
      })
    }

    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        obtainedMarks,
        status: 'GRADED'
      }
    })

    res.json({ message: 'Submission graded successfully!', submission: updated })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = {
  createAssignment,
  getAllAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  getMySubmissions,
  gradeSubmission
}
