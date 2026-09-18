const getPercentage = (/** @type {number} */ obtainedMarks, /** @type {number} */ totalMarks) => {
  if (!totalMarks) return 0
  return Number(((obtainedMarks / totalMarks) * 100).toFixed(2))
}

const getGradeFromPercentage = (/** @type {number} */ percentage) => {
  if (percentage >= 90) return 'A+'
  if (percentage >= 80) return 'A'
  if (percentage >= 70) return 'B+'
  if (percentage >= 60) return 'B'
  if (percentage >= 50) return 'C+'
  if (percentage >= 40) return 'C'
  return 'F'
}

const getGradePointFromPercentage = (/** @type {number} */ percentage) => {
  if (percentage >= 90) return 4.0
  if (percentage >= 80) return 3.6
  if (percentage >= 70) return 3.2
  if (percentage >= 60) return 2.8
  if (percentage >= 50) return 2.4
  if (percentage >= 40) return 2.0
  return 0.0
}

const getGradeSnapshot = (/** @type {number} */ obtainedMarks, /** @type {number} */ totalMarks) => {
  const percentage = getPercentage(obtainedMarks, totalMarks)

  return {
    grade: getGradeFromPercentage(percentage),
    gradePoint: getGradePointFromPercentage(percentage)
  }
}

/** @template {Pick<import("@prisma/client").Mark, "obtainedMarks" | "totalMarks" | "grade" | "gradePoint">} T @param {T} mark */
const decorateMark = (mark) => {
  const percentage = getPercentage(mark.obtainedMarks, mark.totalMarks)
  const fallbackSnapshot = getGradeSnapshot(mark.obtainedMarks, mark.totalMarks)

  return {
    ...mark,
    percentage,
    grade: mark.grade || fallbackSnapshot.grade,
    gradePoint: typeof mark.gradePoint === 'number' ? mark.gradePoint : fallbackSnapshot.gradePoint
  }
}

const buildStudentResultSheet = (/** @type {(import("@prisma/client").Mark & {subject: {name: string, code: string}})[]} */ marks) => {
  const subjects = marks.map((mark) => {
    const percentage = getPercentage(mark.obtainedMarks, mark.totalMarks)
    const fallbackSnapshot = getGradeSnapshot(mark.obtainedMarks, mark.totalMarks)

    return {
      id: mark.id,
      subjectId: mark.subjectId,
      subjectName: mark.subject.name,
      subjectCode: mark.subject.code,
      obtainedMarks: mark.obtainedMarks,
      totalMarks: mark.totalMarks,
      percentage: Number(percentage.toFixed(2)),
      grade: mark.grade || fallbackSnapshot.grade,
      gradePoint: typeof mark.gradePoint === 'number' ? mark.gradePoint : fallbackSnapshot.gradePoint,
      remarks: mark.remarks || ''
    }
  }).sort((left, right) => left.subjectCode.localeCompare(right.subjectCode))

  const totalObtainedMarks = subjects.reduce((sum, subject) => sum + subject.obtainedMarks, 0)
  const totalMarks = subjects.reduce((sum, subject) => sum + subject.totalMarks, 0)
  const overallPercentage = totalMarks > 0 ? getPercentage(totalObtainedMarks, totalMarks) : 0
  const overallGpa = subjects.length > 0
    ? Number((subjects.reduce((sum, subject) => sum + subject.gradePoint, 0) / subjects.length).toFixed(2))
    : 0

  return {
    subjects,
    totals: {
      obtainedMarks: totalObtainedMarks,
      totalMarks
    },
    overallPercentage: Number(overallPercentage.toFixed(2)),
    overallGrade: getGradeFromPercentage(overallPercentage),
    overallGpa
  }
}

module.exports = {
  buildStudentResultSheet,
  decorateMark,
  getGradeFromPercentage,
  getGradePointFromPercentage,
  getGradeSnapshot,
  getPercentage
}
