const { createController } = require('../../utils/controllerAdapter')
const {
  exportCoordinatorDepartmentAttendanceReport: exportCoordinatorDepartmentAttendanceReportService,
  exportAttendanceBySubject: exportAttendanceBySubjectService
} = require('../../services/attendance/export.service')

const exportCoordinatorDepartmentAttendanceReport = createController(exportCoordinatorDepartmentAttendanceReportService)
const exportAttendanceBySubject = createController(exportAttendanceBySubjectService)

module.exports = {
  exportCoordinatorDepartmentAttendanceReport: exportCoordinatorDepartmentAttendanceReport,
  exportAttendanceBySubject: exportAttendanceBySubject
}
