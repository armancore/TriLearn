const prisma = require('./prisma')

const getMatchingSubjectFilter = (/** @type {number} */ semester, /** @type {string | null | undefined} */ department) => ({
  semester,
  OR: [
    { department: null },
    { department: '' },
    ...(department ? [{ department }] : [])
  ]
})

const enrollStudentInMatchingSubjects = async (/** @type {{studentId: string, semester: number, department?: string | null}} */ { studentId, semester, department }) => {
  const matchingSubjects = await prisma.subject.findMany({
    where: getMatchingSubjectFilter(/** @type {number} */ semester, /** @type {string | null | undefined} */ department),
    select: { id: true }
  })

  if (matchingSubjects.length === 0) {
    return { enrolledCount: 0, subjectIds: [] }
  }

  await prisma.subjectEnrollment.createMany({
    data: matchingSubjects.map((subject) => ({
      subjectId: subject.id,
      studentId
    })),
    skipDuplicates: true
  })

  return {
    enrolledCount: matchingSubjects.length,
    subjectIds: matchingSubjects.map((subject) => subject.id)
  }
}

const syncStudentEnrollmentForSemester = async (/** @type {{studentId: string, semester: number, department?: string | null}} */ { studentId, semester, department }) => {
  const [matchingSubjects, existingEnrollments] = await Promise.all([
    prisma.subject.findMany({
      where: getMatchingSubjectFilter(/** @type {number} */ semester, /** @type {string | null | undefined} */ department),
      select: { id: true }
    }),
    prisma.subjectEnrollment.findMany({
      where: { studentId },
      select: {
        subjectId: true,
        subject: {
          select: {
            semester: true,
            department: true
          }
        }
      }
    })
  ])

  const matchingSubjectIds = matchingSubjects.map((subject) => subject.id)
  const matchingSubjectIdSet = new Set(matchingSubjectIds)
  const obsoleteSubjectIds = existingEnrollments
    .filter((enrollment) => !matchingSubjectIdSet.has(enrollment.subjectId))
    .map((enrollment) => enrollment.subjectId)

  await prisma.$transaction([
    prisma.subjectEnrollment.deleteMany({
      where: {
        studentId,
        ...(obsoleteSubjectIds.length > 0 ? { subjectId: { in: obsoleteSubjectIds } } : { subjectId: { in: [] } })
      }
    }),
    prisma.subjectEnrollment.createMany({
      data: matchingSubjectIds.map((subjectId) => ({
        subjectId,
        studentId
      })),
      skipDuplicates: true
    })
  ])

  return {
    enrolledCount: matchingSubjectIds.length,
    subjectIds: matchingSubjectIds,
    removedCount: obsoleteSubjectIds.length,
    removedSubjectIds: obsoleteSubjectIds
  }
}

const getMatchingStudentFilter = (/** @type {number} */ semester, /** @type {string | null | undefined} */ department) => ({
  semester,
  user: { isActive: true, deletedAt: null },
  ...(department ? { department } : {})
})

const enrollMatchingStudentsInSubject = async (/** @type {{subjectId: string, semester: number, department?: string | null}} */ { subjectId, semester, department }) => {
  const matchingStudents = await prisma.student.findMany({
    where: getMatchingStudentFilter(/** @type {number} */ semester, /** @type {string | null | undefined} */ department),
    select: { id: true }
  })

  if (matchingStudents.length === 0) {
    return { enrolledCount: 0, studentIds: [] }
  }

  await prisma.subjectEnrollment.createMany({
    data: matchingStudents.map((student) => ({
      subjectId,
      studentId: student.id
    })),
    skipDuplicates: true
  })

  return {
    enrolledCount: matchingStudents.length,
    studentIds: matchingStudents.map((student) => student.id)
  }
}

const syncMatchingStudentsForSubject = async (/** @type {{subjectId: string, semester: number, department?: string | null}} */ { subjectId, semester, department }) => {
  const matchingStudents = await prisma.student.findMany({
    where: getMatchingStudentFilter(/** @type {number} */ semester, /** @type {string | null | undefined} */ department),
    select: { id: true }
  })

  const matchingStudentIds = matchingStudents.map((student) => student.id)

  if (matchingStudentIds.length === 0) {
    return {
      enrolledCount: 0,
      studentIds: []
    }
  }

  await prisma.$transaction([
    prisma.subjectEnrollment.deleteMany({
      where: {
        subjectId,
        studentId: { notIn: matchingStudentIds }
      }
    }),
    prisma.subjectEnrollment.createMany({
      data: matchingStudentIds.map((studentId) => ({
        subjectId,
        studentId
      })),
      skipDuplicates: true
    })
  ])

  return {
    enrolledCount: matchingStudentIds.length,
    studentIds: matchingStudentIds
  }
}

module.exports = {
  enrollStudentInMatchingSubjects,
  syncStudentEnrollmentForSemester,
  enrollMatchingStudentsInSubject,
  syncMatchingStudentsForSubject
}
