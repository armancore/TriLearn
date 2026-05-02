delete require.cache[require.resolve('../../services/attendance/export.service')]
const {
  exportCoordinatorDepartmentAttendanceReport: exportCoordinatorDepartmentAttendanceReportService,
  exportAttendanceBySubject: exportAttendanceBySubjectService
} = require('../../services/attendance/export.service')

const exportCoordinatorDepartmentAttendanceReport = async (req, res) => {
  return exportCoordinatorDepartmentAttendanceReportService(req, res)
}

const exportAttendanceBySubject = async (req, res) => {
  return exportAttendanceBySubjectService(req, res)
}
module.exports = {
  exportCoordinatorDepartmentAttendanceReport: exportCoordinatorDepartmentAttendanceReport,
  exportAttendanceBySubject: exportAttendanceBySubject
}
