const prisma = require('../../utils/prisma')

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE']
const QR_VALIDITY_MINUTES = 15

const getOwnedSubject = async (subjectId, context) => {
  const { user, instructor } = context
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

  if (user.role === 'COORDINATOR') {
    const coordinatorDepartments = [context.coordinator?.department].filter(Boolean)

    if (coordinatorDepartments.length === 0) {
      return { error: { status: 403, message: 'Coordinator department is not configured yet' } }
    }

    if (!subject.department || !coordinatorDepartments.includes(subject.department)) {
      return { error: { status: 403, message: 'You can only manage attendance for subjects in your department' } }
    }

    return { subject }
  }

  if (user.role === 'INSTRUCTOR') {
    if (!instructor) {
      return { error: { status: 403, message: 'Instructor profile not found' } }
    }

    if (!subject.instructorId) {
      return { error: { status: 403, message: 'Assign an instructor to this subject before managing attendance' } }
    }

    if (subject.instructorId !== instructor.id) {
      return { error: { status: 403, message: 'You can only manage attendance for your assigned subjects' } }
    }

    return { subject, instructor }
  }

  return { subject }
}

const getSubjectStudents = async (subject, filters = {}) => {
  const normalizedSemester = filters.semester ? parseInt(filters.semester, 10) : null
  const normalizedSection = filters.section ? String(filters.section).trim() : ''

  return prisma.student.findMany({
    where: {
      user: { isActive: true, deletedAt: null },
      ...(normalizedSemester ? { semester: normalizedSemester } : {}),
      ...(normalizedSection ? { section: normalizedSection } : {}),
      subjectEnrollments: {
        some: {
          subjectId: subject.id
        }
      }
    },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          isActive: true
        }
      }
    },
    orderBy: [
      { rollNumber: 'asc' },
      { enrolledAt: 'asc' }
    ]
  })
}

const buildAttendanceSummary = (attendance) => {
  const totals = attendance.reduce((acc, record) => {
    acc.total += 1
    acc[record.status] += 1
    return acc
  }, { total: 0, PRESENT: 0, ABSENT: 0, LATE: 0 })

  return {
    total: totals.total,
    present: totals.PRESENT,
    absent: totals.ABSENT,
    late: totals.LATE
  }
}

const buildStatusSummary = (groups) => {
  const totals = groups.reduce((acc, group) => {
    acc.total += group._count._all
    acc[group.status] = group._count._all
    return acc
  }, { total: 0, PRESENT: 0, ABSENT: 0, LATE: 0 })

  return {
    total: totals.total,
    present: totals.PRESENT,
    absent: totals.ABSENT,
    late: totals.LATE
  }
}

module.exports = {
  ATTENDANCE_STATUSES,
  QR_VALIDITY_MINUTES,
  getOwnedSubject,
  getSubjectStudents,
  buildAttendanceSummary,
  buildStatusSummary
}
