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
} = require('./shared')

const sanitizeFilenamePart = (value) => String(value || 'attendance')
  .replace(/[^a-z0-9-_]+/gi, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase()

const markAttendanceManual = async (req, res) => {
  try {
    const { subjectId, attendanceDate, attendanceList, semester, section } = req.body
    const access = await getOwnedSubject(subjectId, req)
    if (access.error) return res.status(access.error.status).json({ message: access.error.message })

    const instructorId = access.instructor?.id || access.subject.instructorId
    if (!instructorId) return res.status(400).json({ message: 'Assign an instructor to this subject before managing attendance' })
    if (!Array.isArray(attendanceList) || attendanceList.length === 0) return res.status(400).json({ message: 'Please provide at least one attendance entry' })

    const dayRange = getDayRange(attendanceDate)
    if (!dayRange) return res.status(400).json({ message: 'Please provide a valid attendance date' })

    const subjectStudents = await getSubjectStudents(access.subject, { semester, section })
    const allowedStudentIds = new Set(subjectStudents.map((student) => student.id))
    if (subjectStudents.length === 0) return res.status(400).json({ message: 'No students are available for the selected module, semester, and section' })

    const invalidEntry = attendanceList.find(({ studentId, status }) => !studentId || !allowedStudentIds.has(studentId) || !ATTENDANCE_STATUSES.includes(status))
    if (invalidEntry) return res.status(400).json({ message: 'Attendance list contains invalid student or status values' })

    const records = await prisma.$transaction(
      attendanceList.map(({ studentId, status }) => prisma.attendance.upsert({
        where: { studentId_subjectId_date: { studentId, subjectId, date: dayRange.start } },
        update: { status, instructorId, qrCode: null, date: dayRange.start },
        create: { studentId, subjectId, instructorId, status, date: dayRange.start }
      }))
    )

    res.status(201).json({ message: 'Attendance marked successfully!', total: records.length, records, date: dayRange.start })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'ATTENDANCE_MARKED_MANUALLY',
      entityType: 'Attendance',
      entityId: subjectId,
      metadata: { subjectId, attendanceDate: dayRange.start, totalRecords: records.length }
    })
  } catch (error) {
    res.internalError(error)
  }
}

const getAttendanceBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params
    const { date, semester, section } = req.query
    const { page, limit, skip } = getPagination(req.query)

    const access = await getOwnedSubject(subjectId, req)
    if (access.error) return res.status(access.error.status).json({ message: access.error.message })

    const filters = {
      subjectId,
      ...(semester || section ? { student: { ...(semester ? { semester: parseInt(semester, 10) } : {}), ...(section ? { section } : {}) } } : {})
    }
    const dayRange = date ? getDayRange(date) : null
    if (date && !dayRange) return res.status(400).json({ message: 'Please provide a valid date filter' })
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

    res.json({ total, page, limit, attendance, summary: buildStatusSummary(groupedSummary), subject: access.subject })
  } catch (error) {
    res.internalError(error)
  }
}

const getMyAttendance = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query)
    const student = req.student
    if (!student) return res.status(403).json({ message: 'Student profile not found' })

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

    res.json({ total, page, limit, attendance, summary })
  } catch (error) {
    res.internalError(error)
  }
}

const exportMyAttendancePdf = async (req, res) => {
  try {
    const student = req.student
    if (!student) return res.status(403).json({ message: 'Student profile not found' })

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
      return res.status(404).json({ message: 'Student profile not found' })
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
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)

    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    doc.pipe(res)

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
    res.internalError(error)
  }
}

const getSubjectRoster = async (req, res) => {
  try {
    const { subjectId } = req.params
    const { date, semester, section } = req.query
    const access = await getOwnedSubject(subjectId, req)
    if (access.error) return res.status(access.error.status).json({ message: access.error.message })

    const dayRange = getDayRange(date)
    if (!dayRange) return res.status(400).json({ message: 'Please provide a valid date' })

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

    res.json({
      subject: access.subject,
      date: dayRange.start,
      semester: semester ? parseInt(semester, 10) : null,
      section: section || '',
      total: roster.length,
      roster,
      summary: buildAttendanceSummary(attendance)
    })
  } catch (error) {
    res.internalError(error)
  }
}

const getCoordinatorDepartmentAttendanceReport = async (req, res) => {
  try {
    const { month, semester, section } = req.query
    const report = await getCoordinatorDepartmentReportPayload({ coordinator: req.coordinator, month, semester, section })
    if (report.error) return res.status(report.error.status).json({ message: report.error.message })
    res.json(report)
  } catch (error) {
    res.internalError(error)
  }
}

const getMonthlyAttendanceReport = async (req, res) => {
  try {
    const { subjectId } = req.params
    const { month } = req.query
    const access = await getOwnedSubject(subjectId, req)
    if (access.error) return res.status(access.error.status).json({ message: access.error.message })

    const monthRange = getMonthRange(month)
    if (!monthRange) return res.status(400).json({ message: 'Please provide a valid month in YYYY-MM format' })
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

    res.json({
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
    res.internalError(error)
  }
}

module.exports = { markAttendanceManual, getAttendanceBySubject, getMyAttendance, exportMyAttendancePdf, getSubjectRoster, getCoordinatorDepartmentAttendanceReport, getMonthlyAttendanceReport }
