const { createServiceResponder } = require('../utils/serviceResult')
const prisma = require('../utils/prisma')
const { Prisma } = require('@prisma/client')
const { getPagination } = require('../utils/pagination')
const { recordAuditLog } = require('../utils/audit')
const { createNotifications } = require('../utils/notifications')
const { sanitizePlainText } = require('../utils/sanitize')
const {
  buildStudentResultSheet,
  decorateMark,
  getGradeFromPercentage,
  getGradeSnapshot,
  getPercentage
} = require('../utils/marksGrading')
const PDFDocument = require('pdfkit')

const EXAM_TYPES = ['INTERNAL', 'MIDTERM', 'FINAL', 'PREBOARD', 'PRACTICAL']
const STUDENT_VISIBLE_EXAM_TYPES = EXAM_TYPES.filter((type) => type !== 'PRACTICAL')
const EXAM_TYPE_LABELS = {
  INTERNAL: 'Internal',
  MIDTERM: 'Mid-Term',
  FINAL: 'Final',
  PREBOARD: 'Preboard',
  PRACTICAL: 'Practical'
}

const emptyStudentResultSheet = () => ({
  subjects: [],
  totals: { obtainedMarks: 0, totalMarks: 0 },
  overallPercentage: 0,
  overallGrade: '-',
  overallGpa: 0
})

const sanitizeFilenamePart = (value) => String(value || 'marksheet')
  .replace(/[^a-z0-9-_]+/gi, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase()

const getStudentExamContext = async (studentId, requestedExamType) => {
  const availableExamTypesRaw = await prisma.mark.findMany({
    where: {
      studentId,
      isPublished: true,
      examType: { in: STUDENT_VISIBLE_EXAM_TYPES }
    },
    distinct: ['examType'],
    select: { examType: true },
    orderBy: { examType: 'asc' }
  })

  const availableExamTypes = availableExamTypesRaw.map((item) => item.examType)
  const selectedExamType = requestedExamType && STUDENT_VISIBLE_EXAM_TYPES.includes(requestedExamType)
    ? requestedExamType
    : availableExamTypes[0] || null

  return { availableExamTypes, selectedExamType }
}

const getPublishedStudentMarks = async ({ studentId, examType, skip, take }) => {
  const publishedFilter = {
    studentId,
    isPublished: true,
    examType
  }

  const [marks, total, allMarks] = await Promise.all([
    prisma.mark.findMany({
      where: publishedFilter,
      include: {
        subject: { select: { name: true, code: true, semester: true } }
      },
      orderBy: { subject: { code: 'asc' } },
      ...(typeof skip === 'number' ? { skip } : {}),
      ...(typeof take === 'number' ? { take } : {})
    }),
    prisma.mark.count({ where: publishedFilter }),
    prisma.mark.findMany({
      where: publishedFilter,
      include: {
        subject: { select: { name: true, code: true, semester: true } }
      },
      orderBy: { subject: { code: 'asc' } }
    })
  ])

  return {
    marks,
    total,
    allMarks,
    resultSheet: buildStudentResultSheet(allMarks)
  }
}

const getRankingSummary = async ({ student, examType }) => {
  // These fragments are interpolated into raw SQL below; keep them as
  // Prisma.sql/Prisma.empty values and never build them with string concat.
  const departmentCondition = student.department
    ? Prisma.sql`AND s."department" = ${student.department}`
    : Prisma.empty
  const sectionCondition = student.section
    ? Prisma.sql`AND s."section" = ${student.section}`
    : Prisma.empty

  const rankedRows = await prisma.$queryRaw(buildCohortRankingQuery({
    student,
    examType,
    departmentCondition,
    sectionCondition
  }))

  const rankingRow = rankedRows[0]
  if (!rankingRow) {
    return {
      rank: null,
      cohortSize: 0,
      percentile: 0
    }
  }

  const rank = Number(rankingRow.rank) || null
  const cohortSize = Number(rankingRow.cohortSize) || 0
  const percentile = rank && cohortSize > 0
    ? Number((((cohortSize - rank + 1) / cohortSize) * 100).toFixed(2))
    : 0

  return {
    rank,
    cohortSize,
    percentile
  }
}

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const getMyMarksSummary = async (context, result = createServiceResponder()) => {
    const { examType } = context.query
  const student = context.student

  if (!student) {
    return result.withStatus(403, { message: 'Student profile not found' })
  }

  const { availableExamTypes, selectedExamType } = await getStudentExamContext(student.id, examType)

  if (!selectedExamType) {
    return result.ok({
      examType: null,
      availableExamTypes: [],
      resultSheet: emptyStudentResultSheet(),
      analytics: {
        chartData: [],
        strongestSubject: null,
        weakestSubject: null
      },
      ranking: {
        rank: null,
        cohortSize: 0,
        percentile: 0
      }
    })
  }

  const { resultSheet } = await getPublishedStudentMarks({
    studentId: student.id,
    examType: selectedExamType
  })

  const strongestSubject = [...resultSheet.subjects].sort((left, right) => right.percentage - left.percentage)[0] || null
  const weakestSubject = [...resultSheet.subjects].sort((left, right) => left.percentage - right.percentage)[0] || null
  const ranking = await getRankingSummary({
    student,
    examType: selectedExamType
  })

  result.ok({
    examType: selectedExamType,
    availableExamTypes,
    resultSheet,
    analytics: {
      chartData: resultSheet.subjects.map((subject) => ({
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        percentage: subject.percentage,
        gradePoint: subject.gradePoint,
        grade: subject.grade
      })),
      strongestSubject: strongestSubject ? {
        subjectCode: strongestSubject.subjectCode,
        subjectName: strongestSubject.subjectName,
        percentage: strongestSubject.percentage,
        grade: strongestSubject.grade
      } : null,
      weakestSubject: weakestSubject ? {
        subjectCode: weakestSubject.subjectCode,
        subjectName: weakestSubject.subjectName,
        percentage: weakestSubject.percentage,
        grade: weakestSubject.grade
      } : null
    },
    ranking: {
      ...ranking,
      scope: {
        semester: student.semester,
        department: student.department || null,
        section: student.section || null
      }
    }
  })
}

const getStudentMarksheetPayload = async ({ student, examType }) => {
  const { availableExamTypes, selectedExamType } = await getStudentExamContext(student.id, examType)

  if (!selectedExamType) {
    return {
      error: { status: 404, message: 'No published marks are available for a marksheet yet.' }
    }
  }

  const { resultSheet } = await getPublishedStudentMarks({
    studentId: student.id,
    examType: selectedExamType
  })

  if (resultSheet.subjects.length === 0) {
    return {
      error: { status: 404, message: 'No published marks are available for a marksheet yet.' }
    }
  }

  const strongestSubject = [...resultSheet.subjects].sort((left, right) => right.percentage - left.percentage)[0] || null
  const weakestSubject = [...resultSheet.subjects].sort((left, right) => left.percentage - right.percentage)[0] || null

  const studentProfile = await prisma.student.findUnique({
    where: { id: student.id },
    include: {
      user: {
        select: {
          name: true,
          email: true
        }
      }
    }
  })

  if (!studentProfile?.user) {
    return { error: { status: 404, message: 'Student profile not found' } }
  }

  return {
    student: studentProfile,
    examType: selectedExamType,
    examLabel: EXAM_TYPE_LABELS[selectedExamType] || selectedExamType,
    availableExamTypes,
    resultSheet,
    strongestSubject,
    weakestSubject
  }
}

// Prisma's ORM API cannot express the ROW_NUMBER/COUNT window functions used
// for cohort ranking. Keep this query centralized and return Prisma.sql only;
// callers must not pass string-built SQL fragments.
const buildCohortRankingQuery = ({ student, examType, departmentCondition, sectionCondition }) => Prisma.sql`
  WITH ranked AS (
    SELECT
      s.id AS "studentId",
      ROW_NUMBER() OVER (
        ORDER BY
          COALESCE(AVG(m."gradePoint"), 0) DESC,
          COALESCE((SUM(m."obtainedMarks")::decimal / NULLIF(SUM(m."totalMarks"), 0)) * 100, 0) DESC,
          u.name ASC
      )::int AS rank,
      COUNT(*) OVER ()::int AS "cohortSize"
    FROM "Student" s
    INNER JOIN "User" u
      ON u.id = s."userId"
     AND u."isActive" = true
    LEFT JOIN "Mark" m
      ON m."studentId" = s.id
     AND m."isPublished" = true
     AND m."examType" = ${examType}
    WHERE s.semester = ${student.semester}
    ${departmentCondition}
    ${sectionCondition}
    GROUP BY s.id, u.name
  )
  SELECT "studentId", rank, "cohortSize"
  FROM ranked
  WHERE "studentId" = ${student.id}
`

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const exportMyMarksheetPdf = async (context, result = createServiceResponder()) => {
    const { examType } = context.query
  const student = context.student

  if (!student) {
    return result.withStatus(403, { message: 'Student profile not found' })
  }

  const payload = await getStudentMarksheetPayload({ student, examType })
  if (payload.error) {
    return result.withStatus(payload.error.status, { message: payload.error.message })
  }

  const fileName = `marksheet-${sanitizeFilenamePart(payload.student.rollNumber)}-sem-${payload.student.semester}-${sanitizeFilenamePart(payload.examType)}.pdf`
  result.header('Content-Type', 'application/pdf')
  result.header('Content-Disposition', `attachment; filename="${fileName}"`)

  const doc = new PDFDocument({ margin: 40, size: 'A4' })
  doc.pipe(result)

  doc.fontSize(20).text('TriLearn Semester Marksheet', { align: 'center' })
  doc.moveDown(0.3)
  doc.fontSize(11).text(`${payload.examLabel} Result`, { align: 'center' })
  doc.moveDown(1)

  doc.fontSize(12).text(`Student: ${payload.student.user.name}`)
  doc.text(`Roll Number: ${payload.student.rollNumber}`)
  doc.text(`Email: ${payload.student.user.email}`)
  doc.text(`Department: ${payload.student.department || '-'}`)
  doc.text(`Semester: ${payload.student.semester}`)
  doc.text(`Section: ${payload.student.section || '-'}`)
  doc.moveDown(0.8)

  doc.fontSize(13).text('Result Overview')
  doc.fontSize(11)
  doc.text(`Overall GPA: ${payload.resultSheet.overallGpa.toFixed(2)}`)
  doc.text(`Overall Grade: ${payload.resultSheet.overallGrade}`)
  doc.text(`Overall Percentage: ${payload.resultSheet.overallPercentage.toFixed(2)}%`)
  doc.text(`Combined Score: ${payload.resultSheet.totals.obtainedMarks}/${payload.resultSheet.totals.totalMarks}`)
  doc.moveDown(0.8)

  doc.fontSize(13).text('Subject-wise Marks')
  doc.moveDown(0.5)

  payload.resultSheet.subjects.forEach((subject, index) => {
    if (doc.y > 720) {
      doc.addPage()
    }

    doc.fontSize(11).text(`${index + 1}. ${subject.subjectName} (${subject.subjectCode})`)
    doc.fontSize(10)
    doc.text(`Marks: ${subject.obtainedMarks}/${subject.totalMarks}`)
    doc.text(`Percentage: ${subject.percentage.toFixed(2)}%`)
    doc.text(`Grade: ${subject.grade}`)
    doc.text(`Grade Point: ${subject.gradePoint.toFixed(1)}`)
    doc.text(`Remarks: ${subject.remarks || '-'}`)
    doc.moveDown(0.5)
  })

  if (payload.strongestSubject || payload.weakestSubject) {
    if (doc.y > 700) {
      doc.addPage()
    }

    doc.moveDown(0.5)
    doc.fontSize(13).text('Performance Snapshot')
    doc.fontSize(10)
    doc.text(`Strongest Subject: ${payload.strongestSubject ? `${payload.strongestSubject.subjectName} (${payload.strongestSubject.subjectCode}) - ${payload.strongestSubject.percentage.toFixed(2)}%` : '-'}`)
    doc.text(`Needs Attention: ${payload.weakestSubject ? `${payload.weakestSubject.subjectName} (${payload.weakestSubject.subjectCode}) - ${payload.weakestSubject.percentage.toFixed(2)}%` : '-'}`)
  }

  doc.moveDown(1)
  doc.fontSize(9).fillColor('#64748b').text(`Generated on ${new Date().toLocaleString()}`, { align: 'right' })
  doc.end()
}

const getManagedSubject = async (subjectId, context) => {
  const { user, instructor, coordinator } = context
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
    if (!coordinator?.department) {
      return { error: { status: 403, message: 'Coordinator department is not configured yet' } }
    }

    if (!subject.department || subject.department !== coordinator.department) {
      return { error: { status: 403, message: 'You can only manage marks for subjects in your department' } }
    }

    return { subject, coordinator }
  }

  if (user.role === 'INSTRUCTOR') {
    if (!instructor) {
      return { error: { status: 403, message: 'Instructor profile not found' } }
    }

    if (!subject.instructorId) {
      return { error: { status: 403, message: 'Assign an instructor to this subject before managing marks' } }
    }

    if (subject.instructorId !== instructor.id) {
      return { error: { status: 403, message: 'You can only view marks for your assigned subjects' } }
    }

    return { subject, instructor }
  }

  return { subject }
}

const getViewableSubject = async (subjectId, context) => {
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

  if (context.user.role === 'COORDINATOR') {
    if (!context.coordinator?.department) {
      return { error: { status: 403, message: 'Coordinator department is not configured yet' } }
    }

    if (!subject.department || subject.department !== context.coordinator.department) {
      return { error: { status: 403, message: 'You can only view marks for subjects in your department' } }
    }
  }

  if (context.user.role === 'INSTRUCTOR') {
    if (!context.instructor) {
      return { error: { status: 403, message: 'Instructor profile not found' } }
    }

    if (subject.instructorId !== context.instructor.id) {
      return { error: { status: 403, message: 'You can only view marks for your assigned subjects' } }
    }
  }

  return { subject }
}

const buildStaffReviewFilters = async ({ subjectId, examType, context }) => {
  const where = {}

  if (context.user.role === 'COORDINATOR' && !context.coordinator?.department) {
    return { error: { status: 403, message: 'Coordinator department is not configured yet' } }
  }

  if (context.user.role === 'INSTRUCTOR' && !context.instructor?.id) {
    return { error: { status: 403, message: 'Instructor profile not found' } }
  }

  if (subjectId) {
    const access = await getViewableSubject(subjectId, context)
    if (access.error) {
      return { error: access.error }
    }

    where.subjectId = subjectId
  }

  if (examType) {
    where.examType = examType
  }

  if (context.user.role === 'COORDINATOR') {
    where.subject = {
      ...(where.subject || {}),
      department: context.coordinator.department
    }
  }

  if (context.user.role === 'INSTRUCTOR') {
    where.subject = {
      ...(where.subject || {}),
      instructorId: context.instructor.id
    }
  }

  return { where }
}

const getStaffStudentResultAccessError = async (student, context) => {
  if (context.user.role === 'COORDINATOR') {
    if (!context.coordinator?.department) {
      return { status: 403, message: 'Coordinator department is not configured yet' }
    }

    if (!student.department || student.department !== context.coordinator.department) {
      return { status: 403, message: 'You can only view marks for students in your department' }
    }
  }

  if (context.user.role === 'INSTRUCTOR') {
    if (!context.instructor?.id) {
      return { status: 403, message: 'Instructor profile not found' }
    }

    const enrollment = await prisma.subjectEnrollment.findFirst({
      where: {
        studentId: student.id,
        subject: {
          instructorId: context.instructor.id
        }
      },
      select: { id: true }
    })

    if (!enrollment) {
      return { status: 403, message: 'You can only view marks for students enrolled in your assigned subjects' }
    }
  }

  return null
}

const createMarkPayload = ({ studentId, subjectId, instructorId, examType, totalMarks, obtainedMarks, remarks }) => ({
  ...getGradeSnapshot(obtainedMarks, totalMarks),
  studentId,
  subjectId,
  instructorId,
  examType,
  totalMarks,
  obtainedMarks,
  remarks: sanitizePlainText(remarks),
  isPublished: false,
  publishedAt: null,
  publishedBy: null
})

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const addMarks = async (context, result = createServiceResponder()) => {
    const { studentId, subjectId, examType, totalMarks, obtainedMarks, remarks } = context.body

  const access = await getManagedSubject(subjectId, context)
  if (access.error) {
    return result.withStatus(access.error.status, { message: access.error.message })
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
    return result.withStatus(400, { message: 'Selected student is not enrolled in this subject' })
  }

  const instructorId = access.instructor?.id || access.subject.instructorId
  if (!instructorId) {
    return result.withStatus(400, { message: 'Assign an instructor to this subject before managing marks' })
  }

  let mark

  try {
    mark = await prisma.mark.create({
      data: createMarkPayload({
        studentId,
        subjectId,
        instructorId,
        examType,
        totalMarks,
        obtainedMarks,
        remarks
      }),
      include: {
        student: { include: { user: { select: { name: true } } } },
        subject: { select: { name: true, code: true } }
      }
    })
  } catch (error) {
    if (error.code === 'P2002') {
      return result.withStatus(400, { message: 'Marks already added for this exam type' })
    }

    throw error
  }

  result.withStatus(201, { message: 'Marks added successfully!', mark: decorateMark(mark) })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'MARK_CREATED',
    entityType: 'Mark',
    entityId: mark.id,
    metadata: { subjectId, studentId, examType }
  })
}

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const getStudentResultForStaff = async (context, result = createServiceResponder()) => {
  const { studentId } = context.params
  const { examType } = context.query

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          deletedAt: true
        }
      }
    }
  })

  if (!student || !student.user?.isActive || student.user.deletedAt) {
    return result.withStatus(404, { message: 'Student not found' })
  }

  const accessError = await getStaffStudentResultAccessError(student, context)
  if (accessError) {
    return result.withStatus(accessError.status, { message: accessError.message })
  }

  const where = {
    studentId,
    ...(examType ? { examType } : {})
  }

  if (context.user.role === 'INSTRUCTOR') {
    where.subject = {
      instructorId: context.instructor.id
    }
  }

  const marks = await prisma.mark.findMany({
    where,
    include: {
      subject: { select: { id: true, name: true, code: true, semester: true, department: true } },
      instructor: { include: { user: { select: { name: true, email: true } } } }
    },
    orderBy: [
      { examType: 'asc' },
      { subject: { code: 'asc' } }
    ]
  })

  const decoratedMarks = marks.map(decorateMark)
  const selectedExamTypes = [...new Set(decoratedMarks.map((mark) => mark.examType))]
  const resultSheets = selectedExamTypes.reduce((sheets, type) => {
    sheets[type] = buildStudentResultSheet(decoratedMarks.filter((mark) => mark.examType === type))
    return sheets
  }, {})

  result.ok({
    student: {
      id: student.id,
      userId: student.user.id,
      name: student.user.name,
      email: student.user.email,
      rollNumber: student.rollNumber,
      semester: student.semester,
      section: student.section,
      department: student.department
    },
    examType: examType || null,
    availableExamTypes: selectedExamTypes,
    marks: decoratedMarks,
    resultSheets
  })
}

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const addMarksBulk = async (context, result = createServiceResponder()) => {
  try {
    const { subjectId, examType, totalMarks, entries } = context.body

    const access = await getManagedSubject(subjectId, context)
    if (access.error) {
      return result.withStatus(access.error.status, { message: access.error.message })
    }

    const instructorId = access.instructor?.id || access.subject.instructorId
    if (!instructorId) {
      return result.withStatus(400, { message: 'Assign an instructor to this subject before managing marks' })
    }

    const uniqueStudentIds = [...new Set(entries.map((entry) => entry.studentId))]
    if (uniqueStudentIds.length !== entries.length) {
      return result.withStatus(400, { message: 'Each student can only appear once in a bulk marks request' })
    }

    const [enrollments, existingMarks] = await Promise.all([
      prisma.subjectEnrollment.findMany({
        where: {
          subjectId,
          studentId: { in: uniqueStudentIds },
          student: {
            user: {
              isActive: true,
              deletedAt: null
            }
          }
        },
        select: { studentId: true }
      }),
      prisma.mark.findMany({
        where: {
          subjectId,
          examType,
          studentId: { in: uniqueStudentIds }
        },
        select: { studentId: true }
      })
    ])

    const enrolledStudentIds = new Set(enrollments.map((enrollment) => enrollment.studentId))
    const existingStudentIds = new Set(existingMarks.map((mark) => mark.studentId))

    const notEnrolledIds = uniqueStudentIds.filter((studentId) => !enrolledStudentIds.has(studentId))
    if (notEnrolledIds.length > 0) {
      return result.withStatus(400, {
        message: 'Some selected students are not enrolled in this subject',
        studentIds: notEnrolledIds
      })
    }

    const duplicateMarkIds = uniqueStudentIds.filter((studentId) => existingStudentIds.has(studentId))
    if (duplicateMarkIds.length > 0) {
      return result.withStatus(400, {
        message: 'Marks already exist for some students in this exam type',
        studentIds: duplicateMarkIds
      })
    }

    const createdMarks = await prisma.$transaction(entries.map((entry) => (
      prisma.mark.create({
        data: createMarkPayload({
          studentId: entry.studentId,
          subjectId,
          instructorId,
          examType,
          totalMarks,
          obtainedMarks: entry.obtainedMarks,
          remarks: entry.remarks
        }),
        include: {
          student: { include: { user: { select: { name: true } } } },
          subject: { select: { name: true, code: true } }
        }
      })
    )))

    result.withStatus(201, {
      message: `Marks added successfully for ${createdMarks.length} student${createdMarks.length === 1 ? '' : 's'}!`,
      marks: createdMarks.map(decorateMark),
      count: createdMarks.length
    })

    await prisma.auditLog.createMany({
      data: createdMarks.map((mark) => ({
        actorId: context.user.id,
        actorRole: context.user.role,
        action: 'MARK_CREATED',
        entityType: 'Mark',
        entityId: mark.id,
        metadata: { subjectId, studentId: mark.studentId, examType, bulk: true }
      }))
    })
  } catch (error) {
    if (error.code === 'P2002') {
      return result.withStatus(400, { message: 'One or more marks already exist for this exam type' })
    }

    throw error
  }
}

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const updateMarks = async (context, result = createServiceResponder()) => {
    const { id } = context.params
  const { obtainedMarks, remarks } = context.body

  const mark = await prisma.mark.findUnique({ where: { id } })
  if (!mark) {
    return result.withStatus(404, { message: 'Mark not found' })
  }

  const access = await getManagedSubject(mark.subjectId, context)
  if (access.error) {
    return result.withStatus(access.error.status, { message: access.error.message })
  }

  const updated = await prisma.mark.update({
    where: { id },
    data: {
      ...getGradeSnapshot(obtainedMarks, mark.totalMarks),
      obtainedMarks,
      remarks: sanitizePlainText(remarks),
      isPublished: false,
      publishedAt: null,
      publishedBy: null
    }
  })

  result.ok({
    message: 'Marks updated successfully! The result is now unpublished until an admin publishes it again.',
    mark: decorateMark(updated)
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'MARK_UPDATED',
    entityType: 'Mark',
    entityId: updated.id,
    metadata: {
      studentId: mark.studentId,
      subjectId: mark.subjectId,
      examType: mark.examType,
      previous: {
        obtainedMarks: mark.obtainedMarks,
        remarks: mark.remarks,
        grade: mark.grade,
        gradePoint: mark.gradePoint,
        isPublished: mark.isPublished,
        publishedAt: mark.publishedAt,
        publishedBy: mark.publishedBy
      },
      next: {
        obtainedMarks: updated.obtainedMarks,
        remarks: updated.remarks,
        grade: updated.grade,
        gradePoint: updated.gradePoint,
        isPublished: updated.isPublished,
        publishedAt: updated.publishedAt,
        publishedBy: updated.publishedBy
      }
    }
  })
}

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const getMarksBySubject = async (context, result = createServiceResponder()) => {
    const { subjectId } = context.params
  const { examType } = context.query
  const { page, limit, skip } = getPagination(context.query)

  const access = await getViewableSubject(subjectId, context)
  if (access.error) {
    return result.withStatus(access.error.status, { message: access.error.message })
  }

  const filters = { subjectId }
  if (examType) filters.examType = examType

  const [marks, total] = await Promise.all([
    prisma.mark.findMany({
      where: filters,
      include: {
        student: { include: { user: { select: { name: true } } } },
        subject: { select: { name: true, code: true } }
      },
      orderBy: [
        { examType: 'asc' },
        { createdAt: 'desc' }
      ],
      skip,
      take: limit
    }),
    prisma.mark.count({ where: filters })
  ])

  const decoratedMarks = marks.map(decorateMark)
  const overallPercentage = decoratedMarks.length > 0
    ? getPercentage(
        decoratedMarks.reduce((sum, mark) => sum + mark.obtainedMarks, 0),
        decoratedMarks.reduce((sum, mark) => sum + mark.totalMarks, 0)
      )
    : 0

  result.ok({
    total,
    page,
    limit,
    marks: decoratedMarks,
    subject: access.subject,
    availableExamTypes: [...new Set(decoratedMarks.map((mark) => mark.examType))],
    stats: {
      records: total,
      published: decoratedMarks.filter((mark) => mark.isPublished).length,
      unpublished: decoratedMarks.filter((mark) => !mark.isPublished).length,
      overallPercentage: Number(overallPercentage.toFixed(2)),
      overallGrade: getGradeFromPercentage(overallPercentage)
    }
  })
}

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const getMarksReview = async (context, result = createServiceResponder()) => {
    const { examType, subjectId } = context.query
  const { page, limit, skip } = getPagination(context.query)

  const filters = await buildStaffReviewFilters({ subjectId, examType, context })
  if (filters.error) {
    return result.withStatus(filters.error.status, { message: filters.error.message })
  }

  const { where } = filters

  const [marks, total] = await Promise.all([
    prisma.mark.findMany({
      where,
      include: {
        student: { include: { user: { select: { name: true, email: true } } } },
        subject: { select: { id: true, name: true, code: true, semester: true, department: true } }
      },
      orderBy: [
        { examType: 'asc' },
        { subject: { code: 'asc' } },
        { student: { rollNumber: 'asc' } }
      ],
      skip,
      take: limit
    }),
    prisma.mark.count({ where })
  ])

  const decoratedMarks = marks.map(decorateMark)
  const byExamType = EXAM_TYPES.map((type) => ({
    examType: type,
    count: decoratedMarks.filter((mark) => mark.examType === type).length,
    published: decoratedMarks.filter((mark) => mark.examType === type && mark.isPublished).length
  })).filter((item) => item.count > 0)

  result.ok({
    total,
    page,
    limit,
    marks: decoratedMarks,
    availableExamTypes: [...new Set(decoratedMarks.map((mark) => mark.examType))],
    stats: {
      total,
      published: decoratedMarks.filter((mark) => mark.isPublished).length,
      unpublished: decoratedMarks.filter((mark) => !mark.isPublished).length,
      byExamType
    }
  })
}

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const getEnrolledStudentsBySubject = async (context, result = createServiceResponder()) => {
    const { subjectId } = context.params

  const access = await getManagedSubject(subjectId, context)
  if (access.error) {
    return result.withStatus(access.error.status, { message: access.error.message })
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
              isActive: true,
              deletedAt: true
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
    .filter(({ student }) => student?.user?.isActive && !student.user.deletedAt)
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

  result.ok({ total: students.length, students, subject: access.subject })
}

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const getMyMarks = async (context, result = createServiceResponder()) => {
    const { page, limit, skip } = getPagination(context.query)
  const { examType } = context.query
  const student = context.student

  if (!student) {
    return result.withStatus(403, { message: 'Student profile not found' })
  }

  const { availableExamTypes, selectedExamType } = await getStudentExamContext(student.id, examType)

  if (!selectedExamType) {
    return result.ok({
      total: 0,
      page,
      limit,
      examType: null,
      availableExamTypes: [],
      resultSheet: emptyStudentResultSheet()
    })
  }
  const { marks, total, resultSheet } = await getPublishedStudentMarks({
    studentId: student.id,
    examType: selectedExamType,
    skip,
    take: limit
  })

  result.ok({
    total,
    page,
    limit,
    examType: selectedExamType,
    availableExamTypes,
    marks: marks.map(decorateMark),
    resultSheet
  })
}

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const deleteMarks = async (context, result = createServiceResponder()) => {
    const { id } = context.params

  const mark = await prisma.mark.findUnique({ where: { id } })
  if (!mark) {
    return result.withStatus(404, { message: 'Mark not found' })
  }

  const access = await getManagedSubject(mark.subjectId, context)
  if (access.error) {
    return result.withStatus(access.error.status, { message: access.error.message })
  }

  await prisma.mark.delete({ where: { id } })

  result.ok({ message: 'Mark deleted successfully!' })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'MARK_DELETED',
    entityType: 'Mark',
    entityId: id,
    metadata: {
      studentId: mark.studentId,
      subjectId: mark.subjectId,
      examType: mark.examType
    }
  })
}

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const publishMarks = async (context, result = createServiceResponder()) => {
    const { subjectId, examType } = context.body

  if (context.user.role !== 'ADMIN') {
    return result.withStatus(403, { message: 'Only admins can publish exam results' })
  }

  if (examType === 'PRACTICAL') {
    return result.withStatus(400, { message: 'Practical marks remain internal and cannot be published for students.' })
  }

  const where = {
    examType,
    ...(subjectId ? { subjectId } : {}),
    ...(context.user.role === 'COORDINATOR' && context.coordinator?.department
      ? {
          subject: {
            department: context.coordinator.department
          }
        }
      : {})
  }

  const existingCount = await prisma.mark.count({ where })
  if (existingCount === 0) {
    return result.withStatus(404, { message: 'No exam marks were found for the selected publication scope' })
  }

  const publishResult = await prisma.mark.updateMany({
    where,
    data: {
      isPublished: true,
      publishedAt: new Date(),
      publishedBy: context.user.id
    }
  })

  const scopeLabel = subjectId ? 'module' : 'selected scope'
  result.ok({
    message: `${examType} results published successfully for the selected ${scopeLabel}.`,
    count: publishResult.count
  })

  const publishedMarks = await prisma.mark.findMany({
    where,
    select: {
      student: {
        select: {
          userId: true
        }
      },
      subject: {
        select: {
          name: true
        }
      }
    },
    distinct: ['studentId']
  })

  await createNotifications({
    userIds: publishedMarks.map((mark) => mark.student.userId),
    type: 'MARKS_PUBLISHED',
    title: `${examType} results published`,
    message: subjectId
      ? `Your ${examType.toLowerCase()} result for ${publishedMarks[0]?.subject?.name || 'the selected module'} is now available.`
      : `Your ${examType.toLowerCase()} results are now available.`,
    link: '/student/marks',
    metadata: {
      examType,
      subjectId: subjectId || null,
      audience: context.user.role
    },
    dedupeKeyFactory: (userId) => `marks-published:${userId}:${examType}:${subjectId || context.user.role}`,
    requestId: context.requestId
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'MARKS_PUBLISHED',
    entityType: 'Mark',
    metadata: {
      subjectId: subjectId || 'ALL_SELECTED_SUBJECTS',
      examType,
      count: publishResult.count,
      audience: context.user.role
    }
  })
}

module.exports = {
  addMarks,
  addMarksBulk,
  updateMarks,
  getMarksBySubject,
  getStudentResultForStaff,
  getMarksReview,
  getEnrolledStudentsBySubject,
  getMyMarks,
  getMyMarksSummary,
  exportMyMarksheetPdf,
  deleteMarks,
  publishMarks,
  __testing: {
    buildCohortRankingQuery,
    getGradeSnapshot,
    getPercentage,
    buildStudentResultSheet
  }
}
