const { createServiceResponder } = require('../../utils/serviceResult')
const ExcelJS = require('exceljs')
const PDFDocument = require('pdfkit')
const {
  getAttendanceExportPayload,
  getCoordinatorDepartmentReportPayload,
  formatDisplayDate
} = require('./shared.service')
const { sanitizeXlsxCell } = require('../../utils/sanitize')

const sanitizeFilenamePart = (value) => String(value || 'report')
  .replace(/[^a-z0-9-_]+/gi, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase()

const parseAttendanceAverage = (value) => {
  const parsedValue = Number.parseFloat(value)
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

const exportAttendancePdf = ({ result, attendance, summary, subject, dateLabel }) => {
  const fileName = `attendance-${sanitizeFilenamePart(subject.code || subject.name)}-${sanitizeFilenamePart(dateLabel)}.pdf`
  const doc = new PDFDocument({ margin: 40, size: 'A4' })

  result.header('Content-Type', 'application/pdf')
  result.header('Content-Disposition', `attachment; filename="${fileName}"`)

  doc.pipe(result)
  doc.fontSize(18).text('Attendance Report', { align: 'center' })
  doc.moveDown(0.5)
  doc.fontSize(12).text(`Subject: ${subject.name} (${subject.code})`)
  doc.text(`Date: ${dateLabel}`)
  doc.text(`Generated: ${formatDisplayDate(new Date())}`)
  doc.moveDown()

  doc.fontSize(12).text(`Total Records: ${summary.total}`)
  doc.text(`Present: ${summary.present}`)
  doc.text(`Absent: ${summary.absent}`)
  doc.text(`Late: ${summary.late}`)
  doc.moveDown()

  attendance.forEach((record, index) => {
    if (doc.y > 730) {
      doc.addPage()
    }

    doc
      .fontSize(10)
      .text(`${index + 1}. ${record.student?.user?.name || 'Unknown Student'}`)
      .text(`Roll: ${record.student?.rollNumber || '-'} | Email: ${record.student?.user?.email || '-'}`)
      .text(`Date: ${formatDisplayDate(record.date)} | Status: ${record.status}`)
      .moveDown(0.5)
  })

  doc.end()
}

const exportAttendanceWorkbook = async ({ result, attendance, summary, subject, dateLabel }) => {
  const workbook = new ExcelJS.Workbook()
  const summarySheet = workbook.addWorksheet('Summary')
  const recordsSheet = workbook.addWorksheet('Records')
  const fileName = `attendance-${sanitizeFilenamePart(subject.code || subject.name)}-${sanitizeFilenamePart(dateLabel)}.xlsx`

  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 24 },
    { header: 'Value', key: 'value', width: 32 }
  ]
  summarySheet.addRows([
    { metric: sanitizeXlsxCell('Subject'), value: sanitizeXlsxCell(`${subject.name} (${subject.code})`) },
    { metric: sanitizeXlsxCell('Date'), value: sanitizeXlsxCell(dateLabel) },
    { metric: 'Total Records', value: summary.total },
    { metric: 'Present', value: summary.present },
    { metric: 'Absent', value: summary.absent },
    { metric: 'Late', value: summary.late }
  ])

  recordsSheet.columns = [
    { header: 'S.N.', key: 'sn', width: 8 },
    { header: 'Student Name', key: 'name', width: 28 },
    { header: 'Roll Number', key: 'rollNumber', width: 20 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Date', key: 'date', width: 16 },
    { header: 'Status', key: 'status', width: 14 }
  ]
  attendance.forEach((record, index) => {
    recordsSheet.addRow({
      sn: index + 1,
      name: sanitizeXlsxCell(record.student?.user?.name || 'Unknown Student'),
      rollNumber: sanitizeXlsxCell(record.student?.rollNumber || '-'),
      email: sanitizeXlsxCell(record.student?.user?.email || '-'),
      date: sanitizeXlsxCell(formatDisplayDate(record.date)),
      status: sanitizeXlsxCell(record.status)
    })
  })

  result.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  result.header('Content-Disposition', `attachment; filename="${fileName}"`)
  await workbook.xlsx.write(result)
  result.end()
}

const exportCoordinatorDepartmentReportPdf = ({ result, report }) => {
  const fileName = `department-attendance-${sanitizeFilenamePart(report.department)}-sem-${report.semester}-${sanitizeFilenamePart(report.monthLabel)}${report.section ? `-section-${sanitizeFilenamePart(report.section)}` : ''}.pdf`
  const doc = new PDFDocument({ margin: 40, size: 'A4' })

  result.header('Content-Type', 'application/pdf')
  result.header('Content-Disposition', `attachment; filename="${fileName}"`)

  doc.pipe(result)
  doc.fontSize(18).text('Department Attendance Report', { align: 'center' })
  doc.moveDown(0.5)
  doc.fontSize(12).text(`Department: ${report.department}`)
  doc.text(`Semester: ${report.semester}`)
  doc.text(`Section: ${report.section || 'All sections'}`)
  doc.text(`Month: ${report.monthLabel}`)
  doc.moveDown()

  doc.text(`Total Students: ${report.totalStudents}`)
  doc.text(`Present Entries: ${report.summary.present}`)
  doc.text(`Absent Entries: ${report.summary.absent}`)
  doc.text(`Late Entries: ${report.summary.late}`)
  doc.moveDown()

  doc.fontSize(13).text('Student Monthly Averages')
  doc.moveDown(0.5)

  report.students.forEach((student, index) => {
    if (doc.y > 730) doc.addPage()
    doc
      .fontSize(10)
      .text(`${index + 1}. ${student.name} (${student.rollNumber})`)
      .text(`Section: ${student.section || '-'} | Present: ${student.present} | Absent: ${student.absent} | Late: ${student.late} | Average: ${student.monthlyAverage}%`)
      .moveDown(0.4)
  })

  if (report.records.length > 0) {
    doc.addPage()
    doc.fontSize(13).text('Attendance Record List')
    doc.moveDown(0.5)
    report.records.forEach((record, index) => {
      if (doc.y > 730) doc.addPage()
      doc
        .fontSize(10)
        .text(`${index + 1}. ${record.student.name} (${record.student.rollNumber})`)
        .text(`Subject: ${record.subject.name} (${record.subject.code})`)
        .text(`Date: ${formatDisplayDate(record.date)} | Status: ${record.status}`)
        .moveDown(0.4)
    })
  }

  doc.end()
}

const exportCoordinatorDepartmentReportWorkbook = async ({ result, report }) => {
  const workbook = new ExcelJS.Workbook()
  const studentsSheet = workbook.addWorksheet('Attendance Percentages')
  const fileName = `department-attendance-${sanitizeFilenamePart(report.department)}-sem-${report.semester}-${sanitizeFilenamePart(report.monthLabel)}${report.section ? `-section-${sanitizeFilenamePart(report.section)}` : ''}.xlsx`

  studentsSheet.columns = [
    { header: 'S.N.', key: 'sn', width: 8 },
    { header: 'Student Name', key: 'name', width: 28 },
    { header: 'Student ID', key: 'studentId', width: 20 },
    { header: 'Total Percentage', key: 'totalPercentage', width: 18 }
  ]
  report.students.forEach((student, index) => {
    const studentRow = studentsSheet.addRow({
      sn: index + 1,
      name: sanitizeXlsxCell(student.name),
      studentId: sanitizeXlsxCell(student.rollNumber),
      totalPercentage: student.monthlyAverage
    })

    if (parseAttendanceAverage(student.monthlyAverage) < 80) {
      studentRow.getCell(2).font = { color: { argb: 'FFFF0000' }, bold: true }
    }
  })

  result.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  result.header('Content-Disposition', `attachment; filename="${fileName}"`)
  await workbook.xlsx.write(result)
  result.end()
}

/**
 * Handles export coordinator department attendance report business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const exportCoordinatorDepartmentAttendanceReport = async (context, result = createServiceResponder()) => {
    const { month, semester, section, format = 'xlsx' } = context.query
  const report = await getCoordinatorDepartmentReportPayload({
    coordinator: context.coordinator,
    month,
    semester,
    section
  })

  if (report.error) {
    return result.withStatus(report.error.status, { message: report.error.message })
  }

  if (format === 'pdf') {
    exportCoordinatorDepartmentReportPdf({ result, report })
    return
  }

  await exportCoordinatorDepartmentReportWorkbook({ result, report })
}

/**
 * Handles export attendance by subject business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const exportAttendanceBySubject = async (context, result = createServiceResponder()) => {
    const { subjectId } = context.params
  const { date, month, format = 'xlsx' } = context.query

  const report = await getAttendanceExportPayload({
    subjectId,
    date,
    month,
    context
  })

  if (report.error) {
    return result.withStatus(report.error.status, { message: report.error.message })
  }

  if (format === 'pdf') {
    exportAttendancePdf({ result, ...report })
    return
  }

  await exportAttendanceWorkbook({ result, ...report })
}

module.exports = {
  exportCoordinatorDepartmentAttendanceReport,
  exportAttendanceBySubject
}
