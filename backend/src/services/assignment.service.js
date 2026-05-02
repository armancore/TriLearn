const prisma = require('../utils/prisma')
const { buildUploadedFileUrl } = require('../utils/fileStorage')
const { getPagination } = require('../utils/pagination')
const ExcelJS = require('exceljs')
const PDFDocument = require('pdfkit')
const { sanitizePlainText, sanitizeXlsxCell } = require('../utils/sanitize')

const resolveAssignmentManager = async (req, subjectId) => {
  const { user, instructor } = req
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

  if (user.role === 'COORDINATOR' || user.role === 'ADMIN') {
    if (!subject.instructorId) {
      return { error: { status: 400, message: 'Assign an instructor to this subject before managing assignments' } }
    }

    return { subject, instructorId: subject.instructorId }
  }

  if (!instructor) {
    return { error: { status: 403, message: 'Instructor profile not found' } }
  }

  if (!subject.instructorId) {
    return { error: { status: 403, message: 'Assign an instructor to this subject before managing assignments' } }
  }

  if (subject.instructorId !== instructor.id) {
    return { error: { status: 403, message: 'You can only manage assignments for your assigned subjects' } }
  }

  return { subject, instructorId: instructor.id }
}

const sanitizeFilenamePart = (value) => String(value || 'report')
  .replace(/[^a-z0-9-_]+/gi, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase()

const getSubmissionViewForRole = (submission, role) => {
  if (role === 'STUDENT') {
    return {
      id: submission.id,
      assignmentId: submission.assignmentId,
      studentId: submission.studentId,
      fileUrl: submission.fileUrl,
      note: submission.note,
      feedback: submission.feedback,
      submittedAt: submission.submittedAt,
      status: submission.status
    }
  }

  return submission
}

const buildAssignmentExportRows = (assignment) => (
  assignment.submissions.map((submission) => ({
    studentName: submission.student?.user?.name || 'Unknown Student',
    rollNumber: submission.student?.rollNumber || '-',
    email: submission.student?.user?.email || '-',
    submittedAt: submission.submittedAt,
    status: submission.status,
    obtainedMarks: submission.obtainedMarks ?? null,
    totalMarks: assignment.totalMarks,
    feedback: submission.feedback || '',
    percentage: submission.obtainedMarks !== null && submission.obtainedMarks !== undefined
      ? Number(((submission.obtainedMarks / assignment.totalMarks) * 100).toFixed(2))
      : null
  }))
)

// ================================
// CREATE ASSIGNMENT
// ================================
/**
 * Handles create assignment business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createAssignment = async (req, response) => {
  try {
    const { title, description, subjectId, dueDate, totalMarks } = req.body
    const questionPdfUrl = buildUploadedFileUrl(req.file)
    const parsedTotalMarks = totalMarks ? parseInt(totalMarks, 10) : 100

    if (!questionPdfUrl) {
      return response.status(400).json({ message: 'Please upload the assignment question PDF' })
    }

    if (Number.isNaN(parsedTotalMarks) || parsedTotalMarks <= 0) {
      return response.status(400).json({ message: 'Total marks must be a valid positive number' })
    }

    const access = await resolveAssignmentManager(req, subjectId)
    if (access.error) {
      return response.status(access.error.status).json({ message: access.error.message })
    }

    const sanitizedTitle = sanitizePlainText(title)
    const sanitizedDescription = sanitizePlainText(description)

    const assignment = await prisma.assignment.create({
      data: {
        title: sanitizedTitle,
        description: sanitizedDescription,
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

    response.status(201).json({
      message: 'Assignment created successfully!',
      assignment
    })
  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// GET ALL ASSIGNMENTS
// ================================
/**
 * Handles get all assignments business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAllAssignments = async (req, response) => {
  try {
    const { subjectId } = req.query
    const { page, limit, skip } = getPagination(req.query)

    const filters = {}
    if (subjectId) filters.subjectId = subjectId

    if (req.user.role === 'INSTRUCTOR') {
      filters.instructorId = req.instructor?.id || '__no_assignments__'
    }

    if (req.user.role === 'STUDENT') {
      const student = req.student
      if (!student) {
        return response.status(403).json({ message: 'Student profile not found' })
      }

      filters.subject = {
        enrollments: {
          some: {
            studentId: student.id
          }
        }
      }
    }

    const [assignments, total] = await Promise.all([
      prisma.assignment.findMany({
        where: filters,
        include: {
          subject: { select: { name: true, code: true } },
          instructor: { include: { user: { select: { name: true } } } },
          _count: { select: { submissions: true } }
        },
        orderBy: { dueDate: 'asc' },
        skip,
        take: limit
      }),
      prisma.assignment.count({ where: filters })
    ])

    response.json({ total, page, limit, assignments })
  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// GET ASSIGNMENT BY ID
// ================================
/**
 * Handles get assignment by id business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAssignmentById = async (req, response) => {
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
      return response.status(404).json({ message: 'Assignment not found' })
    }

    if (req.user.role === 'STUDENT') {
      const student = req.student

      if (!student) {
        return response.status(403).json({ message: 'Student profile not found' })
      }

      const enrolled = await prisma.subjectEnrollment.findUnique({
        where: {
          subjectId_studentId: {
            subjectId: assignment.subjectId,
            studentId: student.id
          }
        }
      })

      if (!enrolled) {
        return response.status(403).json({ message: 'You can only view assignments for your enrolled modules' })
      }

      return response.json({
        assignment: {
          ...assignment,
          submissions: assignment.submissions
            .filter((submission) => submission.studentId === student.id)
            .map((submission) => getSubmissionViewForRole(submission, 'STUDENT'))
        }
      })
    }

    response.json({ assignment })
  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// UPDATE ASSIGNMENT
// ================================
/**
 * Handles update assignment business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const updateAssignment = async (req, response) => {
  try {
    const { id } = req.params
    const { title, description, dueDate, totalMarks } = req.body
    const questionPdfUrl = buildUploadedFileUrl(req.file)
    const parsedTotalMarks = totalMarks !== undefined ? parseInt(totalMarks, 10) : undefined

    const assignment = await prisma.assignment.findUnique({ where: { id } })
    if (!assignment) {
      return response.status(404).json({ message: 'Assignment not found' })
    }

    if (parsedTotalMarks !== undefined && (Number.isNaN(parsedTotalMarks) || parsedTotalMarks <= 0)) {
      return response.status(400).json({ message: 'Total marks must be a valid positive number' })
    }

    if (req.user.role === 'INSTRUCTOR') {
      if (assignment.instructorId !== req.instructor?.id) {
        return response.status(403).json({ message: 'You can only update your own assignments' })
      }
    }

    const sanitizedTitle = sanitizePlainText(title)
    const sanitizedDescription = sanitizePlainText(description)

    const updated = await prisma.assignment.update({
      where: { id },
      data: {
        title: sanitizedTitle,
        description: sanitizedDescription,
        questionPdfUrl: questionPdfUrl || assignment.questionPdfUrl,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        totalMarks: parsedTotalMarks
      }
    })

    response.json({ message: 'Assignment updated successfully!', assignment: updated })
  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// DELETE ASSIGNMENT
// ================================
/**
 * Handles delete assignment business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteAssignment = async (req, response) => {
  try {
    const { id } = req.params

    const assignment = await prisma.assignment.findUnique({ where: { id } })
    if (!assignment) {
      return response.status(404).json({ message: 'Assignment not found' })
    }

    if (req.user.role === 'INSTRUCTOR') {
      if (assignment.instructorId !== req.instructor?.id) {
        return response.status(403).json({ message: 'You can only delete your own assignments' })
      }
    }

    await prisma.assignment.delete({ where: { id } })

    response.json({ message: 'Assignment deleted successfully!' })
  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// SUBMIT ASSIGNMENT
// ================================
/**
 * Handles submit assignment business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const submitAssignment = async (req, response) => {
  try {
    const { id } = req.params
    const { note } = req.body
    const fileUrl = buildUploadedFileUrl(req.file)

    const student = req.student

    if (!student) {
      return response.status(403).json({ message: 'Student profile not found' })
    }

    const assignment = await prisma.assignment.findUnique({ where: { id } })
    if (!assignment) {
      return response.status(404).json({ message: 'Assignment not found' })
    }

    const existingSubmission = await prisma.submission.findFirst({
      where: { assignmentId: id, studentId: student.id }
    })

    if (existingSubmission) {
      return response.status(400).json({ message: 'You have already submitted this assignment' })
    }

    if (!fileUrl) {
      return response.status(400).json({ message: 'Please upload your answer PDF' })
    }

    const isLate = new Date() > new Date(assignment.dueDate)

    const sanitizedNote = sanitizePlainText(note)

    const submission = await prisma.submission.create({
      data: {
        assignmentId: id,
        studentId: student.id,
        note: sanitizedNote,
        fileUrl,
        status: isLate ? 'LATE' : 'SUBMITTED'
      },
      include: {
        assignment: { select: { title: true, dueDate: true } },
        student: { include: { user: { select: { name: true } } } }
      }
    })

    response.status(201).json({
      message: isLate ? 'Assignment submitted late!' : 'Assignment submitted successfully!',
      submission
    })
  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// GET MY SUBMISSIONS
// ================================
/**
 * Handles get my submissions business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getMySubmissions = async (req, response) => {
  try {
    const student = req.student

    if (!student) {
      return response.status(403).json({ message: 'Student profile not found' })
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

    response.json({
      total: submissions.length,
      submissions: submissions.map((submission) => getSubmissionViewForRole(submission, 'STUDENT'))
    })
  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// GRADE SUBMISSION
// ================================
/**
 * Handles grade submission business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const gradeSubmission = async (req, response) => {
  try {
    const { submissionId } = req.params
    const { obtainedMarks, feedback } = req.body

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assignment: true }
    })

    if (!submission) {
      return response.status(404).json({ message: 'Submission not found' })
    }

    if (req.user.role === 'INSTRUCTOR') {
      if (submission.assignment.instructorId !== req.instructor?.id) {
        return response.status(403).json({ message: 'You can only grade submissions for your own assignments' })
      }
    }

    if (obtainedMarks > submission.assignment.totalMarks) {
      return response.status(400).json({
        message: `Marks cannot exceed total marks (${submission.assignment.totalMarks})`
      })
    }

    const sanitizedFeedback = sanitizePlainText(feedback)

    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        obtainedMarks,
        feedback: sanitizedFeedback,
        status: 'GRADED'
      }
    })

    response.json({ message: 'Submission graded successfully!', submission: updated })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles export assignment grades business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const exportAssignmentGrades = async (req, response) => {
  try {
    const { id } = req.params
    const { format = 'xlsx' } = req.query

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        subject: { select: { name: true, code: true } },
        submissions: {
          include: {
            student: {
              include: {
                user: { select: { name: true, email: true } }
              }
            }
          },
          orderBy: {
            submittedAt: 'asc'
          }
        }
      }
    })

    if (!assignment) {
      return response.status(404).json({ message: 'Assignment not found' })
    }

    if (req.user.role === 'INSTRUCTOR' && assignment.instructorId !== req.instructor?.id) {
      return response.status(403).json({ message: 'You can only export grades for your own assignments' })
    }

    const rows = buildAssignmentExportRows(assignment)
    const fileBase = `assignment-grades-${sanitizeFilenamePart(assignment.subject?.code || assignment.title)}-${sanitizeFilenamePart(assignment.title)}`

    if (format === 'pdf') {
      response.setHeader('Content-Type', 'application/pdf')
      response.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`)

      const doc = new PDFDocument({ margin: 40, size: 'A4' })
      doc.pipe(response)

      doc.fontSize(18).text('Assignment Grade Report', { align: 'center' })
      doc.moveDown(0.5)
      doc.fontSize(12).text(`Module: ${assignment.subject?.name || '-'}`)
      doc.text(`Code: ${assignment.subject?.code || '-'}`)
      doc.text(`Assignment: ${assignment.title}`)
      doc.text(`Due date: ${new Date(assignment.dueDate).toLocaleString()}`)
      doc.text(`Total marks: ${assignment.totalMarks}`)
      doc.text(`Generated: ${new Date().toLocaleString()}`)
      doc.moveDown()

      if (rows.length === 0) {
        doc.text('No submissions found.')
      } else {
        rows.forEach((row, index) => {
          if (doc.y > 720) {
            doc.addPage()
          }

          doc
            .fontSize(11)
            .text(`${index + 1}. ${row.studentName} (${row.rollNumber})`)
            .fontSize(10)
            .text(`Email: ${row.email}`)
            .text(`Status: ${row.status}`)
            .text(`Submitted: ${new Date(row.submittedAt).toLocaleString()}`)
            .text(`Marks: ${row.obtainedMarks ?? '-'} / ${row.totalMarks}`)
            .text(`Percentage: ${row.percentage ?? '-'}${row.percentage !== null ? '%' : ''}`)
            .text(`Feedback: ${row.feedback || '-'}`)
          doc.moveDown()
        })
      }

      doc.end()
      return
    }

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Assignment Grades')
    sheet.columns = [
      { header: 'Student', key: 'studentName', width: 24 },
      { header: 'Roll Number', key: 'rollNumber', width: 18 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Submitted At', key: 'submittedAt', width: 24 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Obtained Marks', key: 'obtainedMarks', width: 16 },
      { header: 'Total Marks', key: 'totalMarks', width: 14 },
      { header: 'Percentage', key: 'percentage', width: 14 },
      { header: 'Feedback', key: 'feedback', width: 40 }
    ]

    rows.forEach((row) => {
      sheet.addRow({
        studentName: sanitizeXlsxCell(row.studentName),
        rollNumber: sanitizeXlsxCell(row.rollNumber),
        email: sanitizeXlsxCell(row.email),
        submittedAt: sanitizeXlsxCell(new Date(row.submittedAt).toLocaleString()),
        status: sanitizeXlsxCell(row.status),
        obtainedMarks: row.obtainedMarks,
        totalMarks: row.totalMarks,
        percentage: row.percentage,
        feedback: sanitizeXlsxCell(row.feedback || '')
      })
    })

    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response.setHeader('Content-Disposition', `attachment; filename="${fileBase}.xlsx"`)
    await workbook.xlsx.write(response)
    response.end()
  } catch (error) {
    response.internalError(error)
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
  gradeSubmission,
  exportAssignmentGrades
}
