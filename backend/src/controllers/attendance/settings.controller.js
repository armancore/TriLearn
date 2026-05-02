const { createController } = require('../../utils/controllerAdapter')
const {
  getGateAttendanceSettings: getGateAttendanceSettingsService,
  createGateScanWindow: createGateScanWindowService,
  updateGateScanWindow: updateGateScanWindowService,
  deleteGateScanWindow: deleteGateScanWindowService,
  createAttendanceHoliday: createAttendanceHolidayService,
  deleteAttendanceHoliday: deleteAttendanceHolidayService
} = require('../../services/attendance/settings.service')

const getGateAttendanceSettings = createController(getGateAttendanceSettingsService)
const createGateScanWindow = createController(createGateScanWindowService)
const updateGateScanWindow = createController(updateGateScanWindowService)
const deleteGateScanWindow = createController(deleteGateScanWindowService)
const createAttendanceHoliday = createController(createAttendanceHolidayService)
const deleteAttendanceHoliday = createController(deleteAttendanceHolidayService)

module.exports = {
  getGateAttendanceSettings: getGateAttendanceSettings,
  createGateScanWindow: createGateScanWindow,
  updateGateScanWindow: updateGateScanWindow,
  deleteGateScanWindow: deleteGateScanWindow,
  createAttendanceHoliday: createAttendanceHoliday,
  deleteAttendanceHoliday: deleteAttendanceHoliday
}
