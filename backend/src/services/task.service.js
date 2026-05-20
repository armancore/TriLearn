const { createServiceResponder } = require('../utils/serviceResult')
const prisma = require('../utils/prisma')
const { buildUploadedFileUrl } = require('../utils/fileStorage')
const { attachUploadedFileToEntity } = require('../utils/uploadRecords')
const { getPagination } = require('../utils/pagination')
const { sanitizePlainText } = require('../utils/sanitize')

const resolveInstructorTaskSubject = async (context, subjectId) => {
  const { user, instructor } = context

  if (user.role !== 'INSTRUCTOR') {
    return { error: { status: 403, message: 'Only instructors can manage tasks' } }
  }

  if (!instructor) {
    return { error: { status: 403, message: 'Instructor profile not found' } }
  }

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

  if (subject.instructorId !== instructor.id) {
    return { error: { status: 403, message: 'You can only manage tasks for your assigned subjects' } }
  }

  return { subject, instructorId: instructor.id }
}

const getTaskSubmissionViewForRole = (submission, role) => {
  if (role === 'STUDENT') {
    return {
      id: submission.id,
      taskId: submission.taskId,
      studentId: submission.studentId,
      fileUrl: submission.fileUrl,
      note: submission.note,
      feedback: submission.feedback,
      submittedAt: submission.submittedAt,
      reviewedAt: submission.reviewedAt,
      status: submission.status
    }
  }

  return submission
}

const createTask = async (context, result = createServiceResponder()) => {
  const { title, description, subjectId, dueDate } = context.body
  const questionPdfUrl = buildUploadedFileUrl(context.file)

  const access = await resolveInstructorTaskSubject(context, subjectId)
  if (access.error) {
    return result.withStatus(access.error.status, { message: access.error.message })
  }

  const task = await prisma.task.create({
    data: {
      title: sanitizePlainText(title),
      description: sanitizePlainText(description),
      questionPdfUrl,
      subjectId,
      instructorId: access.instructorId,
      dueDate: new Date(dueDate)
    },
    include: {
      subject: { select: { name: true, code: true } },
      instructor: { include: { user: { select: { name: true } } } },
      _count: { select: { submissions: true } }
    }
  })

  await attachUploadedFileToEntity(context.file, 'TASK', task.id)

  result.withStatus(201, {
    message: 'Task created successfully!',
    task
  })
}

const getAllTasks = async (context, result = createServiceResponder()) => {
  const { subjectId } = context.query
  const { page, limit, skip } = getPagination(context.query)
  const filters = {}

  if (subjectId) filters.subjectId = subjectId

  if (context.user.role === 'INSTRUCTOR') {
    filters.instructorId = context.instructor?.id || '__no_tasks__'
  }

  if (context.user.role === 'STUDENT') {
    const student = context.student
    if (!student) {
      return result.withStatus(403, { message: 'Student profile not found' })
    }

    filters.subject = {
      enrollments: {
        some: {
          studentId: student.id
        }
      }
    }
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
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
    prisma.task.count({ where: filters })
  ])

  result.ok({ total, page, limit, tasks })
}

const getTaskById = async (context, result = createServiceResponder()) => {
  const { id } = context.params

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      subject: { select: { name: true, code: true } },
      instructor: { include: { user: { select: { name: true } } } },
      submissions: {
        include: {
          student: {
            include: {
              user: { select: { name: true, email: true } }
            }
          }
        },
        orderBy: { submittedAt: 'desc' }
      }
    }
  })

  if (!task) {
    return result.withStatus(404, { message: 'Task not found' })
  }

  if (context.user.role === 'INSTRUCTOR' && task.instructorId !== context.instructor?.id) {
    return result.withStatus(403, { message: 'You can only view tasks for your assigned subjects' })
  }

  if (context.user.role === 'STUDENT') {
    const student = context.student

    if (!student) {
      return result.withStatus(403, { message: 'Student profile not found' })
    }

    const enrolled = await prisma.subjectEnrollment.findUnique({
      where: {
        subjectId_studentId: {
          subjectId: task.subjectId,
          studentId: student.id
        }
      }
    })

    if (!enrolled) {
      return result.withStatus(403, { message: 'You can only view tasks for your enrolled subjects' })
    }

    return result.ok({
      task: {
        ...task,
        submissions: task.submissions
          .filter((submission) => submission.studentId === student.id)
          .map((submission) => getTaskSubmissionViewForRole(submission, 'STUDENT'))
      }
    })
  }

  result.ok({ task })
}

const updateTask = async (context, result = createServiceResponder()) => {
  const { id } = context.params
  const { title, description, dueDate } = context.body
  const questionPdfUrl = buildUploadedFileUrl(context.file)

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return result.withStatus(404, { message: 'Task not found' })
  }

  const access = await resolveInstructorTaskSubject(context, task.subjectId)
  if (access.error) {
    return result.withStatus(access.error.status, { message: access.error.message })
  }

  const updated = await prisma.task.update({
    where: { id },
    data: {
      title: sanitizePlainText(title),
      description: sanitizePlainText(description),
      questionPdfUrl: questionPdfUrl || task.questionPdfUrl,
      dueDate: new Date(dueDate)
    }
  })

  await attachUploadedFileToEntity(context.file, 'TASK', updated.id)

  result.ok({ message: 'Task updated successfully!', task: updated })
}

const deleteTask = async (context, result = createServiceResponder()) => {
  const { id } = context.params

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return result.withStatus(404, { message: 'Task not found' })
  }

  const access = await resolveInstructorTaskSubject(context, task.subjectId)
  if (access.error) {
    return result.withStatus(access.error.status, { message: access.error.message })
  }

  await prisma.task.delete({ where: { id } })
  result.ok({ message: 'Task deleted successfully!' })
}

const submitTask = async (context, result = createServiceResponder()) => {
  const { id } = context.params
  const { note } = context.body
  const fileUrl = buildUploadedFileUrl(context.file)
  const student = context.student

  if (!student) {
    return result.withStatus(403, { message: 'Student profile not found' })
  }

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return result.withStatus(404, { message: 'Task not found' })
  }

  const enrolled = await prisma.subjectEnrollment.findUnique({
    where: {
      subjectId_studentId: {
        subjectId: task.subjectId,
        studentId: student.id
      }
    }
  })

  if (!enrolled) {
    return result.withStatus(403, { message: 'You can only submit tasks for your enrolled subjects' })
  }

  if (!fileUrl) {
    return result.withStatus(400, { message: 'Please upload your answer PDF' })
  }

  const existingSubmission = await prisma.taskSubmission.findUnique({
    where: {
      taskId_studentId: {
        taskId: id,
        studentId: student.id
      }
    }
  })

  if (existingSubmission) {
    return result.withStatus(400, { message: 'You have already submitted this task' })
  }

  const isLate = new Date() > new Date(task.dueDate)
  const submission = await prisma.taskSubmission.create({
    data: {
      taskId: id,
      studentId: student.id,
      note: sanitizePlainText(note),
      fileUrl,
      status: isLate ? 'LATE' : 'SUBMITTED'
    },
    include: {
      task: { select: { title: true, dueDate: true } },
      student: { include: { user: { select: { name: true } } } }
    }
  })

  await attachUploadedFileToEntity(context.file, 'TASK_SUBMISSION', submission.id)

  result.withStatus(201, {
    message: isLate ? 'Task submitted late!' : 'Task submitted successfully!',
    submission
  })
}

const getMyTaskSubmissions = async (context, result = createServiceResponder()) => {
  const student = context.student

  if (!student) {
    return result.withStatus(403, { message: 'Student profile not found' })
  }

  const submissions = await prisma.taskSubmission.findMany({
    where: { studentId: student.id },
    include: {
      task: {
        include: {
          subject: { select: { name: true, code: true } }
        }
      }
    },
    orderBy: { submittedAt: 'desc' }
  })

  result.ok({
    total: submissions.length,
    submissions: submissions.map((submission) => getTaskSubmissionViewForRole(submission, 'STUDENT'))
  })
}

const reviewTaskSubmission = async (context, result = createServiceResponder()) => {
  const { submissionId } = context.params
  const { feedback } = context.body

  const submission = await prisma.taskSubmission.findUnique({
    where: { id: submissionId },
    include: { task: true }
  })

  if (!submission) {
    return result.withStatus(404, { message: 'Task submission not found' })
  }

  if (submission.task.instructorId !== context.instructor?.id) {
    return result.withStatus(403, { message: 'You can only review submissions for your own tasks' })
  }

  const updated = await prisma.taskSubmission.update({
    where: { id: submissionId },
    data: {
      feedback: sanitizePlainText(feedback),
      status: 'REVIEWED',
      reviewedAt: new Date()
    }
  })

  result.ok({ message: 'Feedback saved successfully!', submission: updated })
}

module.exports = {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  submitTask,
  getMyTaskSubmissions,
  reviewTaskSubmission
}
