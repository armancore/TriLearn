const prisma = require('./prisma')

const getMatchingSubjectFilter = (semester, department) => ({
  semester,
  OR: [
    { department: null },
    { department: '' },
    ...(department ? [{ department }] : [])
  ]
})

const enrollStudentInMatchingSubjects = async ({ studentId, semester, department }) => {
  const matchingSubjects = await prisma.subject.findMany({
    where: getMatchingSubjectFilter(semester, department),
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

module.exports = {
  enrollStudentInMatchingSubjects
}
