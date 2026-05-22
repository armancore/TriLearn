const { createServiceResponder } = require('../utils/serviceResult')
const prisma = require('../utils/prisma')
const { recordAuditLog } = require('../utils/audit')
const usersService = require('../services/users.service')

const getCoordinatorDepartments = usersService.getCoordinatorDepartments
const getManagedUserDepartments = usersService.getManagedUserDepartments

const normalizeDepartment = (department) => String(department || '').trim().toLowerCase()

const departmentsMatch = (coordinatorDepartment, studentDepartment) => {
  const normalizedCoordinatorDepartment = normalizeDepartment(coordinatorDepartment)
  const normalizedStudentDepartment = normalizeDepartment(studentDepartment)

  return Boolean(normalizedCoordinatorDepartment && normalizedStudentDepartment && normalizedCoordinatorDepartment === normalizedStudentDepartment)
}

const coordinatorCanViewStudent = (context, student) => {
  if (typeof getCoordinatorDepartments === 'function' && typeof getManagedUserDepartments === 'function') {
    const coordinatorDepartments = getCoordinatorDepartments(context)
    const targetDepartments = getManagedUserDepartments({
      role: 'STUDENT',
      student
    })

    if (coordinatorDepartments.length === 0 || targetDepartments.length === 0) {
      return false
    }

    const normalizedCoordinatorDepartments = new Set(
      coordinatorDepartments.map((department) => normalizeDepartment(department))
    )

    return targetDepartments.some((department) => normalizedCoordinatorDepartments.has(normalizeDepartment(department)))
  }

  return departmentsMatch(context.coordinator?.department, student.department)
}

const roundTo = (value, decimals) => {
  const multiplier = 10 ** decimals
  return Math.round(value * multiplier) / multiplier
}

const buildAttendanceSummary = (records) => {
  const bySubject = new Map()

  for (const attendance of records) {
    if (!bySubject.has(attendance.subjectId)) {
      bySubject.set(attendance.subjectId, {
        subjectName: attendance.subject?.name || null,
        subjectCode: attendance.subject?.code || null,
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        percentage: 0
      })
    }

    const subjectAttendance = bySubject.get(attendance.subjectId)
    subjectAttendance.total += 1

    if (attendance.status === 'PRESENT') {
      subjectAttendance.present += 1
    } else if (attendance.status === 'ABSENT') {
      subjectAttendance.absent += 1
    } else if (attendance.status === 'LATE') {
      subjectAttendance.late += 1
    }
  }

  return Array.from(bySubject.values()).map((subjectAttendance) => ({
    ...subjectAttendance,
    percentage: subjectAttendance.total > 0
      ? Math.round((subjectAttendance.present / subjectAttendance.total) * 100)
      : 0
  }))
}

const buildMarksByExamType = (marks) => marks.reduce((groupedMarks, mark) => {
  if (!groupedMarks[mark.examType]) {
    groupedMarks[mark.examType] = []
  }

  groupedMarks[mark.examType].push({
    subjectName: mark.subject?.name || null,
    subjectCode: mark.subject?.code || null,
    examType: mark.examType,
    obtainedMarks: mark.obtainedMarks,
    totalMarks: mark.totalMarks,
    percentage: mark.totalMarks > 0
      ? Math.round((mark.obtainedMarks / mark.totalMarks) * 100)
      : 0,
    grade: mark.grade,
    gradePoint: mark.gradePoint,
    isPublished: mark.isPublished,
    remarks: mark.remarks
  })

  return groupedMarks
}, {})

const getStudentProfile = async (context, result = createServiceResponder()) => {
  const role = context.user?.role

  if (!['ADMIN', 'COORDINATOR', 'INSTRUCTOR'].includes(role)) {
    return result.withStatus(403, { message: 'You are not allowed to view student profiles' })
  }

  const { studentId } = context.params
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      user: {
        deletedAt: null
      }
    },
    select: {
      id: true,
      rollNumber: true,
      semester: true,
      section: true,
      department: true,
      fatherName: true,
      motherName: true,
      fatherPhone: true,
      motherPhone: true,
      bloodGroup: true,
      localGuardianName: true,
      localGuardianAddress: true,
      localGuardianPhone: true,
      permanentAddress: true,
      temporaryAddress: true,
      dateOfBirth: true,
      enrolledAt: true,
      isGraduated: true,
      graduationYear: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          phone: true,
          address: true,
          role: true,
          isActive: true,
          createdAt: true
        }
      }
    }
  })

  if (!student) {
    return result.withStatus(404, { message: 'Student not found' })
  }

  if (role === 'COORDINATOR' && !coordinatorCanViewStudent(context, student)) {
    return result.withStatus(403, { message: 'You can only view students in your own department' })
  }

  let instructorSubjectIds = new Set()
  if (role === 'INSTRUCTOR') {
    if (!context.instructor?.id) {
      return result.withStatus(403, { message: 'Instructor profile not found' })
    }

    const subjects = await prisma.subject.findMany({
      where: { instructorId: context.instructor.id },
      select: { id: true }
    })
    instructorSubjectIds = new Set(subjects.map((subject) => subject.id))

    if (instructorSubjectIds.size === 0) {
      const response = result.ok({
        student,
        attendance: [],
        marks: {},
        assignments: [],
        taskSubmissions: [],
        absenceTickets: [],
        disciplinary: [],
        summary: {
          overallAttendancePct: 0,
          totalSubjects: 0,
          totalAssignments: 0,
          submittedAssignments: 0,
          avgGradePoint: 0,
          totalDisciplinaryRecords: 0
        }
      })

      await recordAuditLog({
        actorId: context.user.id,
        actorRole: role,
        action: 'STUDENT_PROFILE_VIEWED',
        entityType: 'Student',
        entityId: student.id,
        metadata: {
          studentUserId: student.user.id
        }
      })

      return response
    }
  }

  const instructorSubjectFilter = role === 'INSTRUCTOR'
    ? { subjectId: { in: Array.from(instructorSubjectIds) } }
    : {}

  const [
    attendanceRecords,
    markRecords,
    submissionRecords,
    taskSubmissionRecords,
    absenceTicketRecords,
    disciplinaryRecords
  ] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        studentId: student.id,
        ...instructorSubjectFilter
      },
      include: {
        subject: { select: { name: true, code: true } }
      },
      orderBy: { date: 'desc' }
    }),
    prisma.mark.findMany({
      where: {
        studentId: student.id,
        ...instructorSubjectFilter,
        ...(role === 'INSTRUCTOR' ? { isPublished: true } : {})
      },
      include: {
        subject: { select: { name: true, code: true } }
      },
      orderBy: [
        { examType: 'asc' },
        { subject: { code: 'asc' } }
      ]
    }),
    prisma.submission.findMany({
      where: {
        studentId: student.id,
        ...(role === 'INSTRUCTOR' ? { assignment: { instructorId: context.instructor.id } } : {})
      },
      include: {
        assignment: {
          select: {
            title: true,
            dueDate: true,
            totalMarks: true,
            subject: { select: { name: true, code: true } }
          }
        }
      },
      orderBy: { submittedAt: 'desc' }
    }),
    prisma.taskSubmission.findMany({
      where: {
        studentId: student.id,
        ...(role === 'INSTRUCTOR' ? { task: { instructorId: context.instructor.id } } : {})
      },
      include: {
        task: {
          select: {
            title: true,
            dueDate: true,
            subject: { select: { name: true, code: true } }
          }
        }
      },
      orderBy: { submittedAt: 'desc' }
    }),
    prisma.absenceTicket.findMany({
      where: { studentId: student.id },
      include: {
        attendance: {
          include: {
            subject: { select: { name: true, code: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    role === 'INSTRUCTOR'
      ? Promise.resolve([])
      : prisma.disciplinaryRecord.findMany({
          where: { studentId: student.id },
          include: {
            recordedBy: { select: { name: true, role: true } }
          },
          orderBy: { createdAt: 'desc' }
        })
  ])

  const attendance = buildAttendanceSummary(attendanceRecords)
  const marks = buildMarksByExamType(markRecords)
  const assignments = submissionRecords.map((submission) => ({
    id: submission.id,
    kind: 'ASSIGNMENT',
    assignmentTitle: submission.assignment?.title || null,
    subjectName: submission.assignment?.subject?.name || null,
    subjectCode: submission.assignment?.subject?.code || null,
    dueDate: submission.assignment?.dueDate || null,
    submittedAt: submission.submittedAt,
    obtainedMarks: submission.obtainedMarks,
    totalMarks: submission.assignment?.totalMarks || null,
    status: submission.status,
    feedback: submission.feedback,
    note: submission.note,
    fileUrl: submission.fileUrl
  }))
  const taskSubmissions = taskSubmissionRecords.map((submission) => ({
    id: submission.id,
    kind: 'TASK',
    assignmentTitle: submission.task?.title || null,
    subjectName: submission.task?.subject?.name || null,
    subjectCode: submission.task?.subject?.code || null,
    dueDate: submission.task?.dueDate || null,
    submittedAt: submission.submittedAt,
    obtainedMarks: null,
    totalMarks: null,
    status: submission.status,
    feedback: submission.feedback,
    note: submission.note,
    fileUrl: submission.fileUrl,
    reviewedAt: submission.reviewedAt
  }))
  const absenceTickets = absenceTicketRecords.map((ticket) => ({
    id: ticket.id,
    date: ticket.attendance?.date || null,
    subjectName: ticket.attendance?.subject?.name || null,
    subjectCode: ticket.attendance?.subject?.code || null,
    reason: ticket.reason,
    status: ticket.status,
    response: ticket.response,
    createdAt: ticket.createdAt
  }))
  const disciplinary = disciplinaryRecords.map((record) => ({
    id: record.id,
    type: record.type,
    severity: record.severity,
    description: record.description,
    action: record.action,
    date: record.date,
    recordedByName: record.recordedBy?.name || null,
    recordedByRole: record.recordedBy?.role || null,
    createdAt: record.createdAt
  }))

  const averageAttendance = attendance.length > 0
    ? roundTo(attendance.reduce((total, subject) => total + subject.percentage, 0) / attendance.length, 1)
    : 0
  const averageGradePoint = markRecords.length > 0
    ? roundTo(markRecords.reduce((total, mark) => total + mark.gradePoint, 0) / markRecords.length, 2)
    : 0

  const response = result.ok({
    student,
    attendance,
    marks,
    assignments,
    taskSubmissions,
    absenceTickets,
    disciplinary,
    summary: {
      overallAttendancePct: averageAttendance,
      totalSubjects: new Set(attendanceRecords.map((attendanceRecord) => attendanceRecord.subjectId)).size,
      totalAssignments: submissionRecords.length + taskSubmissionRecords.length,
      submittedAssignments: submissionRecords.filter((submission) => submission.status !== null).length + taskSubmissionRecords.filter((submission) => submission.status !== null).length,
      avgGradePoint: averageGradePoint,
      totalDisciplinaryRecords: disciplinary.length
    }
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: role,
    action: 'STUDENT_PROFILE_VIEWED',
    entityType: 'Student',
    entityId: student.id,
    metadata: {
      studentUserId: student.user.id
    }
  })

  return response
}

module.exports = { getStudentProfile }
