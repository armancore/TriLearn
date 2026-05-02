const { createController } = require('../../utils/controllerAdapter')
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

const markAttendanceManual = createController(markAttendanceManualService)
const getAttendanceBySubject = createController(getAttendanceBySubjectService)
const getBulkAttendanceSummary = createController(getBulkAttendanceSummaryService)
const getMyAttendance = createController(getMyAttendanceService)
const exportMyAttendancePdf = createController(exportMyAttendancePdfService)
const getSubjectRoster = createController(getSubjectRosterService)
const getCoordinatorDepartmentAttendanceReport = createController(getCoordinatorDepartmentAttendanceReportService)
const getMonthlyAttendanceReport = createController(getMonthlyAttendanceReportService)

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
