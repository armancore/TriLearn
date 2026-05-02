/* eslint-disable no-useless-catch */
const { createServiceResponder } = require('../../utils/serviceResult')
const { getPagination } = require('../../utils/pagination')
const PDFDocument = require('pdfkit')
const {
  ATTENDANCE_STATUSES,
  prisma,
  getDayRange,
  getMonthRange,
  getOwnedSubject,
  getSubjectStudents,
  buildAttendanceSummary,
  buildStatusSummary,
  createZonedDate,
  formatDisplayDate,
  formatMonthLabel,
  getCoordinatorDepartmentReportPayload,
  recordAuditLog
} = require('./shared.service')

const sanitizeFilenamePart = (value) => String(value || 'attendance')
  .replace(/[^a-z0-9-_]+/gi, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase()

/**
 * Handles mark attendance manual business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const markAttendanceManual = async (context, result = createServiceResponder()) => {
  try {
    const { subjectId, attendanceDate, attendanceList, semester, section } = context.body
    const access = await getOwnedSubject(subjectId, context)
    if (access.error) return result.withStatus(access.error.status, { message: access.error.message })

    const instructorId = access.instructor?.id || access.subject.instructorId
    if (!instructorId) return result.withStatus(400, { message: 'Assign an instructor to this subject before managing attendance' })
    if (!Array.isArray(attendanceList) || attendanceList.length === 0) return result.withStatus(400, { message: 'Please provide at least one attendance entry' })

    const dayRange = getDayRange(attendanceDate)
    if (!dayRange) return result.withStatus(400, { message: 'Please provide a valid attendance date' })

    const subjectStudents = await getSubjectStudents(access.subject, { semester, section })
    const allowedStudentIds = new Set(subjectStudents.map((student) => student.id))
    if (subjectStudents.length === 0) return result.withStatus(400, { message: 'No students are available for the selected module, semester, and section' })

    const invalidEntry = attendanceList.find(({ studentId, status }) => !studentId || !allowedStudentIds.has(studentId) || !ATTENDANCE_STATUSES.includes(status))
    if (invalidEntry) return result.withStatus(400, { message: 'Attendance list contains invalid student or status values' })

    const records = await prisma.$transaction(
      attendanceList.map(({ studentId, status }) => prisma.attendance.upsert({
        where: { studentId_subjectId_date: { studentId, subjectId, date: dayRange.start } },
        update: { status, instructorId, qrCode: null, date: dayRange.start },
        create: { studentId, subjectId, instructorId, status, date: dayRange.start }
      }))
    )

    result.withStatus(201, { message: 'Attendance marked successfully!', total: records.length, records, date: dayRange.start })

    await recordAuditLog({
      actorId: context.user.id,
      actorRole: context.user.role,
      action: 'ATTENDANCE_MARKED_MANUALLY',
      entityType: 'Attendance',
      entityId: subjectId,
      metadata: { subjectId, attendanceDate: dayRange.start, totalRecords: records.length }
    })
  } catch (error) {
    throw error
  }
}

/**
 * Handles get attendance by subject business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAttendanceBySubject = async (context, result = createServiceResponder()) => {
  try {
    const { subjectId } = context.params
    const { date, semester, section } = context.query
    const { page, limit, skip } = getPagination(context.query)

    const access = await getOwnedSubject(subjectId, context)
    if (access.error) return result.withStatus(access.error.status, { message: access.error.message })

    const filters = {
      subjectId,
      ...(semester || section ? { student: { ...(semester ? { semester: parseInt(semester, 10) } : {}), ...(section ? { section } : {}) } } : {})
    }
    const dayRange = date ? getDayRange(date) : null
    if (date && !dayRange) return result.withStatus(400, { message: 'Please provide a valid date filter' })
    if (dayRange) filters.date = { gte: dayRange.start, lt: dayRange.end }

    const [attendance, total, groupedSummary] = await Promise.all([
      prisma.attendance.findMany({
        where: filters,
        include: {
          student: { include: { user: { select: { name: true, email: true } } } },
          subject: { select: { name: true, code: true } }
        },
        orderBy: [{ date: 'desc' }, { student: { rollNumber: 'asc' } }],
        skip,
        take: limit
      }),
      prisma.attendance.count({ where: filters }),
      prisma.attendance.groupBy({ by: ['status'], where: filters, _count: { _all: true } })
    ])

    result.ok({ total, page, limit, attendance, summary: buildStatusSummary(groupedSummary), subject: access.subject })
  } catch (error) {
    throw error
  }
}

/**
 * Handles get bulk attendance summary business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getBulkAttendanceSummary = async (context, result = createServiceResponder()) => {
  try {
    const { subjectIds, date } = context.query
    const uniqueSubjectIds = [...new Set(subjectIds)]
    const dayRange = date ? getDayRange(date) : null

    if (date && !dayRange) {
      return result.withStatus(400, { message: 'Please provide a valid date filter' })
    }

    if (context.user.role === 'INSTRUCTOR' && !context.instructor) {
      return result.withStatus(403, { message: 'Instructor profile not found' })
    }

    if (context.user.role === 'COORDINATOR' && !context.coordinator?.department) {
      return result.withStatus(403, { message: 'Coordinator department is not configured yet' })
    }

    const subjectFilters = {
      id: { in: uniqueSubjectIds },
      ...(context.user.role === 'INSTRUCTOR' ? { instructorId: context.instructor.id } : {}),
      ...(context.user.role === 'COORDINATOR' ? { department: context.coordinator.department } : {})
    }

    const subjects = await prisma.subject.findMany({
      where: subjectFilters,
      select: { id: true }
    })
    const accessibleSubjectIds = subjects.map((subject) => subject.id)

    if (accessibleSubjectIds.length !== uniqueSubjectIds.length) {
      return result.withStatus(403, { message: 'You can only view attendance for subjects you manage' })
    }

    const attendance = await prisma.attendance.findMany({
      where: {
        subjectId: { in: accessibleSubjectIds },
        ...(dayRange ? { date: { gte: dayRange.start, lt: dayRange.end } } : {})
      },
      select: {
        subjectId: true,
        status: true
      }
    })

    const summaries = Object.fromEntries(uniqueSubjectIds.map((subjectId) => [
      subjectId,
      { present: 0, absent: 0, late: 0, total: 0, percentage: 0 }
    ]))

    attendance.forEach((record) => {
      const summary = summaries[record.subjectId]
      if (!summary) {
        return
      }

      summary.total += 1
      if (record.status === 'PRESENT') summary.present += 1
      if (record.status === 'ABSENT') summary.absent += 1
      if (record.status === 'LATE') summary.late += 1
    })

    Object.values(summaries).forEach((summary) => {
      summary.percentage = summary.total > 0
        ? Number((((summary.present + summary.late) / summary.total) * 100).toFixed(1))
        : 0
    })

    result.ok(summaries)
  } catch (error) {
    throw error
  }
}

/**
 * Handles get my attendance business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getMyAttendance = async (context, result = createServiceResponder()) => {
  try {
    const { page, limit, skip } = getPagination(context.query)
    const student = context.student
    if (!student) return result.withStatus(403, { message: 'Student profile not found' })

    const [attendance, total, groupedAttendance] = await Promise.all([
      prisma.attendance.findMany({
        where: { studentId: student.id },
        include: { subject: { select: { name: true, code: true } } },
        orderBy: { date: 'desc' },
        skip,
        take: limit
      }),
      prisma.attendance.count({ where: { studentId: student.id } }),
      prisma.attendance.groupBy({
        where: { studentId: student.id },
        by: ['subjectId', 'status'],
        _count: { _all: true }
      })
    ])

    const subjectIds = [...new Set(groupedAttendance.map((record) => record.subjectId))]
    const subjects = subjectIds.length > 0
      ? await prisma.subject.findMany({
          where: { id: { in: subjectIds } },
          select: { id: true, name: true, code: true }
        })
      : []

    const subjectLookup = new Map(subjects.map((subject) => [subject.id, subject]))
    const subjectMap = {}
    groupedAttendance.forEach((record) => {
      const key = record.subjectId
      if (!subjectMap[key]) {
        subjectMap[key] = {
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          subject: subjectLookup.get(record.subjectId)
        }
      }

      subjectMap[key].total += record._count._all
      if (record.status === 'PRESENT') subjectMap[key].present += record._count._all
      if (record.status === 'ABSENT') subjectMap[key].absent += record._count._all
      if (record.status === 'LATE') subjectMap[key].late += record._count._all
    })

    const summary = Object.values(subjectMap).map((subject) => ({
      subject: subject.subject?.name || 'Unknown Subject',
      code: subject.subject?.code || '-',
      total: subject.total,
      present: subject.present,
      absent: subject.absent,
      late: subject.late,
      percentage: `${(((subject.present + subject.late) / subject.total) * 100).toFixed(1)}%`
    })).sort((left, right) => left.code.localeCompare(right.code))

    result.ok({ total, page, limit, attendance, summary })
  } catch (error) {
    throw error
  }
}

/**
 * Handles export my attendance pdf business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const exportMyAttendancePdf = async (context, result = createServiceResponder()) => {
  try {
    const student = context.student
    if (!student) return result.withStatus(403, { message: 'Student profile not found' })

    const [attendance, studentProfile] = await Promise.all([
      prisma.attendance.findMany({
        where: { studentId: student.id },
        include: { subject: { select: { name: true, code: true } } },
        orderBy: { date: 'desc' }
      }),
      prisma.student.findUnique({
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
    ])

    if (!studentProfile?.user) {
      return result.withStatus(404, { message: 'Student profile not found' })
    }

    const summaryMap = {}
    attendance.forEach((record) => {
      const key = record.subjectId
      if (!summaryMap[key]) {
        summaryMap[key] = {
          subject: record.subject,
          total: 0,
          present: 0,
          absent: 0,
          late: 0
        }
      }

      summaryMap[key].total += 1
      if (record.status === 'PRESENT') summaryMap[key].present += 1
      if (record.status === 'ABSENT') summaryMap[key].absent += 1
      if (record.status === 'LATE') summaryMap[key].late += 1
    })

    const subjectSummaries = Object.values(summaryMap)
      .map((entry) => ({
        ...entry,
        percentage: entry.total > 0 ? Number((((entry.present + entry.late) / entry.total) * 100).toFixed(1)) : 0
      }))
      .sort((left, right) => left.subject.code.localeCompare(right.subject.code))

    const fileName = `attendance-${sanitizeFilenamePart(studentProfile.rollNumber)}.pdf`
    result.header('Content-Type', 'application/pdf')
    result.header('Content-Disposition', `attachment; filename="${fileName}"`)

    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    doc.pipe(result)

    doc.fontSize(20).text('TriLearn Attendance Report', { align: 'center' })
    doc.moveDown(0.5)
    doc.fontSize(11).text(`Student: ${studentProfile.user.name}`)
    doc.text(`Roll Number: ${studentProfile.rollNumber}`)
    doc.text(`Email: ${studentProfile.user.email}`)
    doc.text(`Department: ${studentProfile.department || '-'}`)
    doc.text(`Semester: ${studentProfile.semester}`)
    doc.text(`Section: ${studentProfile.section || '-'}`)
    doc.text(`Generated: ${new Date().toLocaleString()}`)
    doc.moveDown()

    if (!subjectSummaries.length) {
      doc.text('No attendance records available yet.')
      doc.end()
      return
    }

    doc.fontSize(13).text('Subject Summary')
    doc.moveDown(0.5)

    subjectSummaries.forEach((entry, index) => {
      if (doc.y > 720) {
        doc.addPage()
      }

      doc.fontSize(11).text(`${index + 1}. ${entry.subject.name} (${entry.subject.code})`)
      doc.fontSize(10)
      doc.text(`Attendance: ${entry.present} present, ${entry.absent} absent, ${entry.late} late`)
      doc.text(`Attendance Percentage: ${entry.percentage.toFixed(1)}%`)
      doc.moveDown(0.4)
    })

    if (doc.y > 680) {
      doc.addPage()
    }

    doc.moveDown()
    doc.fontSize(13).text('Recent Record Ledger')
    doc.moveDown(0.5)

    attendance.slice(0, 20).forEach((record, index) => {
      if (doc.y > 720) {
        doc.addPage()
      }

      doc.fontSize(10).text(
        `${index + 1}. ${record.subject?.code || '-'} • ${formatDisplayDate(record.date)} • ${record.status}`
      )
    })

    doc.end()
  } catch (error) {
    throw error
  }
}

/**
 * Handles get subject roster business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getSubjectRoster = async (context, result = createServiceResponder()) => {
  try {
    const { subjectId } = context.params
    const { date, semester, section } = context.query
    const access = await getOwnedSubject(subjectId, context)
    if (access.error) return result.withStatus(access.error.status, { message: access.error.message })

    const dayRange = getDayRange(date)
    if (!dayRange) return result.withStatus(400, { message: 'Please provide a valid date' })

    const [students, attendance] = await Promise.all([
      getSubjectStudents(access.subject, { semester, section }),
      prisma.attendance.findMany({
        where: {
          subjectId,
          ...(semester || section ? { student: { ...(semester ? { semester: parseInt(semester, 10) } : {}), ...(section ? { section } : {}) } } : {}),
          date: { gte: dayRange.start, lt: dayRange.end }
        }
      })
    ])

    const attendanceMap = new Map(attendance.map((record) => [record.studentId, record]))
    const roster = students.map((student) => ({
      id: student.id,
      rollNumber: student.rollNumber,
      semester: student.semester,
      section: student.section,
      department: student.department,
      name: student.user.name,
      email: student.user.email,
      status: attendanceMap.get(student.id)?.status || 'PRESENT',
      attendanceId: attendanceMap.get(student.id)?.id || null
    }))

    result.ok({
      subject: access.subject,
      date: dayRange.start,
      semester: semester ? parseInt(semester, 10) : null,
      section: section || '',
      total: roster.length,
      roster,
      summary: buildAttendanceSummary(attendance)
    })
  } catch (error) {
    throw error
  }
}

/**
 * Handles get coordinator department attendance report business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getCoordinatorDepartmentAttendanceReport = async (context, result = createServiceResponder()) => {
  try {
    const { month, semester, section } = context.query
    const report = await getCoordinatorDepartmentReportPayload({ coordinator: context.coordinator, month, semester, section })
    if (report.error) return result.withStatus(report.error.status, { message: report.error.message })
    result.ok(report)
  } catch (error) {
    throw error
  }
}

/**
 * Handles get monthly attendance report business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getMonthlyAttendanceReport = async (context, result = createServiceResponder()) => {
  try {
    const { subjectId } = context.params
    const { month } = context.query
    const access = await getOwnedSubject(subjectId, context)
    if (access.error) return result.withStatus(access.error.status, { message: access.error.message })

    const monthRange = getMonthRange(month)
    if (!monthRange) return result.withStatus(400, { message: 'Please provide a valid month in YYYY-MM format' })
    const [year, monthNumber] = month.split('-').map((value) => Number.parseInt(value, 10))

    const [students, attendance] = await Promise.all([
      getSubjectStudents(access.subject),
      prisma.attendance.findMany({
        where: { subjectId, date: { gte: monthRange.start, lt: monthRange.end } },
        include: { student: { include: { user: { select: { name: true, email: true } } } } },
        orderBy: [{ date: 'asc' }, { student: { rollNumber: 'asc' } }]
      })
    ])

    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
    const attendanceMap = new Map()
    attendance.forEach((record) => attendanceMap.set(`${record.studentId}:${formatDisplayDate(record.date)}`, record.status))

    const studentReports = students.map((student) => {
      const dailyStatuses = []
      let present = 0
      let absent = 0
      let late = 0
      let totalRecorded = 0

      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = formatDisplayDate(createZonedDate(year, monthNumber, day))
        const status = attendanceMap.get(`${student.id}:${dateKey}`) || null

        if (status) {
          totalRecorded += 1
          if (status === 'PRESENT') present += 1
          if (status === 'ABSENT') absent += 1
          if (status === 'LATE') late += 1
        }

        dailyStatuses.push({ day, date: dateKey, status })
      }

      return {
        id: student.id,
        name: student.user.name,
        email: student.user.email,
        rollNumber: student.rollNumber,
        semester: student.semester,
        section: student.section,
        department: student.department,
        present,
        absent,
        late,
        totalRecorded,
        percentage: totalRecorded > 0 ? (((present + late) / totalRecorded) * 100).toFixed(1) : '0.0',
        dailyStatuses
      }
    })

    result.ok({
      subject: access.subject,
      month,
      monthLabel: formatMonthLabel(month),
      summary: buildAttendanceSummary(attendance),
      totalStudents: students.length,
      totalRecords: attendance.length,
      days: Array.from({ length: daysInMonth }, (_, index) => ({
        day: index + 1,
        date: formatDisplayDate(createZonedDate(year, monthNumber, index + 1))
      })),
      students: studentReports
    })
  } catch (error) {
    throw error
  }
}

module.exports = { markAttendanceManual, getAttendanceBySubject, getBulkAttendanceSummary, getMyAttendance, exportMyAttendancePdf, getSubjectRoster, getCoordinatorDepartmentAttendanceReport, getMonthlyAttendanceReport }
