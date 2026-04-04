const prisma = require('../utils/prisma')
const { getPagination } = require('../utils/pagination')
const { recordAuditLog } = require('../utils/audit')
const { createNotifications } = require('../utils/notifications')
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

const getPercentage = (obtainedMarks, totalMarks) => {
  if (!totalMarks) return 0
  return Number(((obtainedMarks / totalMarks) * 100).toFixed(2))
}

const getGradeFromPercentage = (percentage) => {
  if (percentage >= 90) return 'A+'
  if (percentage >= 80) return 'A'
  if (percentage >= 70) return 'B+'
  if (percentage >= 60) return 'B'
  if (percentage >= 50) return 'C+'
  if (percentage >= 40) return 'C'
  return 'F'
}

const getGradePointFromPercentage = (percentage) => {
  if (percentage >= 90) return 4.0
  if (percentage >= 80) return 3.6
  if (percentage >= 70) return 3.2
  if (percentage >= 60) return 2.8
  if (percentage >= 50) return 2.4
  if (percentage >= 40) return 2.0
  return 0.0
}

const decorateMark = (mark) => {
  const percentage = getPercentage(mark.obtainedMarks, mark.totalMarks)

  return {
    ...mark,
    percentage,
    grade: getGradeFromPercentage(percentage),
    gradePoint: getGradePointFromPercentage(percentage)
  }
}

const buildStudentResultSheet = (marks) => {
  const subjects = marks.map((mark) => {
    const percentage = getPercentage(mark.obtainedMarks, mark.totalMarks)

    return {
      id: mark.id,
      subjectId: mark.subjectId,
      subjectName: mark.subject.name,
      subjectCode: mark.subject.code,
      obtainedMarks: mark.obtainedMarks,
      totalMarks: mark.totalMarks,
      percentage: Number(percentage.toFixed(2)),
      grade: getGradeFromPercentage(percentage),
      gradePoint: getGradePointFromPercentage(percentage),
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

const getRankingSummary = async ({ student, examType, overallGpa }) => {
  const cohortStudents = await prisma.student.findMany({
    where: {
      semester: student.semester,
      ...(student.department ? { department: student.department } : {}),
      user: { isActive: true }
    },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [
      { rollNumber: 'asc' }
    ]
  })

  if (cohortStudents.length === 0) {
    return {
      rank: null,
      cohortSize: 0,
      percentile: 0,
      topStudents: []
    }
  }

  const studentIds = cohortStudents.map((entry) => entry.id)
  const cohortMarks = await prisma.mark.findMany({
    where: {
      studentId: { in: studentIds },
      isPublished: true,
      examType
    },
    include: {
      subject: {
        select: {
          code: true
        }
      }
    },
    orderBy: [
      { subject: { code: 'asc' } }
    ]
  })

  const marksByStudentId = cohortMarks.reduce((accumulator, mark) => {
    if (!accumulator.has(mark.studentId)) {
      accumulator.set(mark.studentId, [])
    }

    accumulator.get(mark.studentId).push(mark)
    return accumulator
  }, new Map())

  const rankedStudents = cohortStudents.map((entry) => {
    const resultSheet = buildStudentResultSheet(marksByStudentId.get(entry.id) || [])
    return {
      studentId: entry.id,
      userId: entry.user.id,
      name: entry.user.name,
      overallGpa: resultSheet.overallGpa,
      overallPercentage: resultSheet.overallPercentage
    }
  }).sort((left, right) => {
    if (right.overallGpa !== left.overallGpa) {
      return right.overallGpa - left.overallGpa
    }

    if (right.overallPercentage !== left.overallPercentage) {
      return right.overallPercentage - left.overallPercentage
    }

    return left.name.localeCompare(right.name)
  })

  const rank = rankedStudents.findIndex((entry) => entry.studentId === student.id) + 1
  const percentile = rank > 0 && cohortStudents.length > 0
    ? Number((((cohortStudents.length - rank) / cohortStudents.length) * 100).toFixed(2))
    : 0

  return {
    rank: rank || null,
    cohortSize: cohortStudents.length,
    percentile,
    topStudents: rankedStudents.slice(0, 5).map((entry) => ({
      userId: entry.userId,
      name: entry.name,
      overallGpa: entry.overallGpa,
      overallPercentage: entry.overallPercentage
    })),
    currentStudentGpa: overallGpa
  }
}

const getMyMarksSummary = async (req, res) => {
  try {
    const { examType } = req.query
    const student = req.student

    if (!student) {
      return res.status(403).json({ message: 'Student profile not found' })
    }

    const { availableExamTypes, selectedExamType } = await getStudentExamContext(student.id, examType)

    if (!selectedExamType) {
      return res.json({
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
          percentile: 0,
          topStudents: []
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
      examType: selectedExamType,
      overallGpa: resultSheet.overallGpa
    })

    res.json({
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
          department: student.department || null
        }
      }
    })
  } catch (error) {
    res.internalError(error)
  }
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
  const ranking = await getRankingSummary({
    student,
    examType: selectedExamType,
    overallGpa: resultSheet.overallGpa
  })

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
    weakestSubject,
    ranking
  }
}

const exportMyMarksheetPdf = async (req, res) => {
  try {
    const { examType } = req.query
    const student = req.student

    if (!student) {
      return res.status(403).json({ message: 'Student profile not found' })
    }

    const payload = await getStudentMarksheetPayload({ student, examType })
    if (payload.error) {
      return res.status(payload.error.status).json({ message: payload.error.message })
    }

    const fileName = `marksheet-${sanitizeFilenamePart(payload.student.rollNumber)}-sem-${payload.student.semester}-${sanitizeFilenamePart(payload.examType)}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)

    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    doc.pipe(res)

    doc.fontSize(20).text('EduNexus Semester Marksheet', { align: 'center' })
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
    if (payload.ranking.rank) {
      doc.text(`Semester Rank: #${payload.ranking.rank} out of ${payload.ranking.cohortSize}`)
      doc.text(`Percentile: ${payload.ranking.percentile.toFixed(2)}%`)
    }
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
  } catch (error) {
    res.internalError(error)
  }
}

const getManagedSubject = async (subjectId, req) => {
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

  if (user.role === 'INSTRUCTOR') {
    if (!instructor) {
      return { error: { status: 403, message: 'Instructor profile not found' } }
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

const buildStaffReviewFilters = ({ req, subjectId, examType }) => {
  const where = {}

  if (subjectId) {
    where.subjectId = subjectId
  }

  if (examType) {
    where.examType = examType
  }

  if (req.user.role === 'COORDINATOR') {
    where.subject = {
      department: req.coordinator?.department || '__no_department__'
    }
  }

  return where
}

const addMarks = async (req, res) => {
  try {
    const { studentId, subjectId, examType, totalMarks, obtainedMarks, remarks } = req.body

    const access = await getManagedSubject(subjectId, req)
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

    const instructorId = access.instructor?.id || access.subject.instructorId
    if (!instructorId) {
      return res.status(400).json({ message: 'Assign an instructor to this subject before managing marks' })
    }

    let mark

    try {
      mark = await prisma.mark.create({
        data: {
          studentId,
          subjectId,
          instructorId,
          examType,
          totalMarks,
          obtainedMarks,
          remarks,
          isPublished: false,
          publishedAt: null,
          publishedBy: null
        },
        include: {
          student: { include: { user: { select: { name: true } } } },
          subject: { select: { name: true, code: true } }
        }
      })
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(400).json({ message: 'Marks already added for this exam type' })
      }

      throw error
    }

    res.status(201).json({ message: 'Marks added successfully!', mark: decorateMark(mark) })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'MARK_CREATED',
      entityType: 'Mark',
      entityId: mark.id,
      metadata: { subjectId, studentId, examType }
    })
  } catch (error) {
    res.internalError(error)
  }
}

const updateMarks = async (req, res) => {
  try {
    const { id } = req.params
    const { obtainedMarks, remarks } = req.body

    const mark = await prisma.mark.findUnique({ where: { id } })
    if (!mark) {
      return res.status(404).json({ message: 'Mark not found' })
    }

    const access = await getManagedSubject(mark.subjectId, req)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    const updated = await prisma.mark.update({
      where: { id },
      data: {
        obtainedMarks,
        remarks,
        isPublished: false,
        publishedAt: null,
        publishedBy: null
      }
    })

    res.json({
      message: 'Marks updated successfully! The result is now unpublished until the coordinator publishes it again.',
      mark: decorateMark(updated)
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'MARK_UPDATED',
      entityType: 'Mark',
      entityId: updated.id,
      metadata: { obtainedMarks: updated.obtainedMarks }
    })
  } catch (error) {
    res.internalError(error)
  }
}

const getMarksBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params
    const { examType } = req.query
    const { page, limit, skip } = getPagination(req.query)

    const access = await getManagedSubject(subjectId, req)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
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

    res.json({
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
  } catch (error) {
    res.internalError(error)
  }
}

const getMarksReview = async (req, res) => {
  try {
    const { examType, subjectId } = req.query
    const { page, limit, skip } = getPagination(req.query)

    const where = buildStaffReviewFilters({ req, subjectId, examType })

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

    res.json({
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
  } catch (error) {
    res.internalError(error)
  }
}

const getEnrolledStudentsBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params

    const access = await getManagedSubject(subjectId, req)
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

const getMyMarks = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query)
    const { examType } = req.query
    const student = req.student

    if (!student) {
      return res.status(403).json({ message: 'Student profile not found' })
    }

    const { availableExamTypes, selectedExamType } = await getStudentExamContext(student.id, examType)

    if (!selectedExamType) {
      return res.json({
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

    res.json({
      total,
      page,
      limit,
      examType: selectedExamType,
      availableExamTypes,
      marks: marks.map(decorateMark),
      resultSheet
    })
  } catch (error) {
    res.internalError(error)
  }
}

const deleteMarks = async (req, res) => {
  try {
    const { id } = req.params

    const mark = await prisma.mark.findUnique({ where: { id } })
    if (!mark) {
      return res.status(404).json({ message: 'Mark not found' })
    }

    await prisma.mark.delete({ where: { id } })

    res.json({ message: 'Mark deleted successfully!' })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'MARK_DELETED',
      entityType: 'Mark',
      entityId: id,
      metadata: {
        studentId: mark.studentId,
        subjectId: mark.subjectId,
        examType: mark.examType
      }
    })
  } catch (error) {
    res.internalError(error)
  }
}

const publishMarks = async (req, res) => {
  try {
    const { subjectId, examType } = req.body

    if (req.user.role !== 'COORDINATOR') {
      return res.status(403).json({ message: 'Only coordinators can publish exam results' })
    }

    if (examType === 'PRACTICAL') {
      return res.status(400).json({ message: 'Practical marks remain internal and cannot be published for students.' })
    }

    if (!req.coordinator?.department) {
      return res.status(403).json({ message: 'Coordinator department is not configured yet' })
    }

    const where = {
      examType,
      subject: {
        department: req.coordinator.department
      },
      ...(subjectId ? { subjectId } : {})
    }

    const existingCount = await prisma.mark.count({ where })
    if (existingCount === 0) {
      return res.status(404).json({ message: 'No exam marks were found for the selected publication scope' })
    }

    const result = await prisma.mark.updateMany({
      where,
      data: {
        isPublished: true,
        publishedAt: new Date(),
        publishedBy: req.user.id
      }
    })

    const scopeLabel = subjectId ? 'module' : 'department'
    res.json({
      message: `${examType} results published successfully for the selected ${scopeLabel}.`,
      count: result.count
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
        department: req.coordinator.department
      },
      dedupeKeyFactory: (userId) => `marks-published:${userId}:${examType}:${subjectId || req.coordinator.department}`
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'MARKS_PUBLISHED',
      entityType: 'Mark',
      metadata: {
        subjectId: subjectId || 'ALL_DEPARTMENT_SUBJECTS',
        examType,
        count: result.count,
        department: req.coordinator.department
      }
    })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = {
  addMarks,
  updateMarks,
  getMarksBySubject,
  getMarksReview,
  getEnrolledStudentsBySubject,
  getMyMarks,
  getMyMarksSummary,
  exportMyMarksheetPdf,
  deleteMarks,
  publishMarks
}
