/* eslint-disable no-useless-catch */
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
  const summarySheet = workbook.addWorksheet('Summary')
  const studentsSheet = workbook.addWorksheet('Student Averages')
  const recordsSheet = workbook.addWorksheet('Attendance Records')
  const fileName = `department-attendance-${sanitizeFilenamePart(report.department)}-sem-${report.semester}-${sanitizeFilenamePart(report.monthLabel)}${report.section ? `-section-${sanitizeFilenamePart(report.section)}` : ''}.xlsx`

  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 24 },
    { header: 'Value', key: 'value', width: 32 }
  ]
  summarySheet.addRows([
    { metric: sanitizeXlsxCell('Department'), value: sanitizeXlsxCell(report.department) },
    { metric: 'Semester', value: report.semester },
    { metric: sanitizeXlsxCell('Section'), value: sanitizeXlsxCell(report.section || 'All sections') },
    { metric: sanitizeXlsxCell('Month'), value: sanitizeXlsxCell(report.monthLabel) },
    { metric: 'Total Students', value: report.totalStudents },
    { metric: 'Present Entries', value: report.summary.present },
    { metric: 'Absent Entries', value: report.summary.absent },
    { metric: 'Late Entries', value: report.summary.late }
  ])

  studentsSheet.columns = [
    { header: 'S.N.', key: 'sn', width: 8 },
    { header: 'Student Name', key: 'name', width: 28 },
    { header: 'Roll Number', key: 'rollNumber', width: 20 },
    { header: 'Section', key: 'section', width: 14 },
    { header: 'Present', key: 'present', width: 12 },
    { header: 'Absent', key: 'absent', width: 12 },
    { header: 'Late', key: 'late', width: 12 },
    { header: 'Monthly Average %', key: 'monthlyAverage', width: 18 }
  ]
  report.students.forEach((student, index) => {
    studentsSheet.addRow({
      sn: index + 1,
      name: sanitizeXlsxCell(student.name),
      rollNumber: sanitizeXlsxCell(student.rollNumber),
      section: sanitizeXlsxCell(student.section || '-'),
      present: student.present,
      absent: student.absent,
      late: student.late,
      monthlyAverage: student.monthlyAverage
    })
  })

  recordsSheet.columns = [
    { header: 'S.N.', key: 'sn', width: 8 },
    { header: 'Student Name', key: 'studentName', width: 28 },
    { header: 'Roll Number', key: 'rollNumber', width: 18 },
    { header: 'Subject', key: 'subjectName', width: 28 },
    { header: 'Subject Code', key: 'subjectCode', width: 16 },
    { header: 'Date', key: 'date', width: 16 },
    { header: 'Status', key: 'status', width: 14 }
  ]
  report.records.forEach((record, index) => {
    recordsSheet.addRow({
      sn: index + 1,
      studentName: sanitizeXlsxCell(record.student.name),
      rollNumber: sanitizeXlsxCell(record.student.rollNumber),
      subjectName: sanitizeXlsxCell(record.subject.name),
      subjectCode: sanitizeXlsxCell(record.subject.code),
      date: sanitizeXlsxCell(formatDisplayDate(record.date)),
      status: sanitizeXlsxCell(record.status)
    })
  })

  result.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  result.header('Content-Disposition', `attachment; filename="${fileName}"`)
  await workbook.xlsx.write(result)
  result.end()
}

/**
 * Handles export coordinator department attendance report business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const exportCoordinatorDepartmentAttendanceReport = async (context, result = createServiceResponder()) => {
  try {
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
  } catch (error) {
    throw error
  }
}

/**
 * Handles export attendance by subject business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const exportAttendanceBySubject = async (context, result = createServiceResponder()) => {
  try {
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
  } catch (error) {
    throw error
  }
}

module.exports = {
  exportCoordinatorDepartmentAttendanceReport,
  exportAttendanceBySubject
}
