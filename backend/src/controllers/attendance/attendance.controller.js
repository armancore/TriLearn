delete require.cache[require.resolve('../../services/attendance/attendance.service')]
const {
  markAttendanceManual: markAttendanceManualService,
  getAttendanceBySubject: getAttendanceBySubjectService,
  getBulkAttendanceSummary: getBulkAttendanceSummaryService,
  getMyAttendance: getMyAttendanceService,
  exportMyAttendancePdf: exportMyAttendancePdfService,
  getSubjectRoster: getSubjectRosterService,
  getCoordinatorDepartmentAttendanceReport: getCoordinatorDepartmentAttendanceReportService,
  getMonthlyAttendanceReport: getMonthlyAttendanceReportService
} = require('../../services/attendance/attendance.service')

const markAttendanceManual = async (req, res) => {
  return markAttendanceManualService(req, res)
}

const getAttendanceBySubject = async (req, res) => {
  return getAttendanceBySubjectService(req, res)
}

const getBulkAttendanceSummary = async (req, res) => {
  return getBulkAttendanceSummaryService(req, res)
}

const getMyAttendance = async (req, res) => {
  return getMyAttendanceService(req, res)
}

const exportMyAttendancePdf = async (req, res) => {
  return exportMyAttendancePdfService(req, res)
}

const getSubjectRoster = async (req, res) => {
  return getSubjectRosterService(req, res)
}

const getCoordinatorDepartmentAttendanceReport = async (req, res) => {
  return getCoordinatorDepartmentAttendanceReportService(req, res)
}

const getMonthlyAttendanceReport = async (req, res) => {
  return getMonthlyAttendanceReportService(req, res)
}
module.exports = {
  markAttendanceManual: markAttendanceManual,
  getAttendanceBySubject: getAttendanceBySubject,
  getBulkAttendanceSummary: getBulkAttendanceSummary,
  getMyAttendance: getMyAttendance,
  exportMyAttendancePdf: exportMyAttendancePdf,
  getSubjectRoster: getSubjectRoster,
  getCoordinatorDepartmentAttendanceReport: getCoordinatorDepartmentAttendanceReport,
  getMonthlyAttendanceReport: getMonthlyAttendanceReport
}
