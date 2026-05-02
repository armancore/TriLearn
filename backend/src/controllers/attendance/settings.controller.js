delete require.cache[require.resolve('../../services/attendance/settings.service')]
const {
  getGateAttendanceSettings: getGateAttendanceSettingsService,
  createGateScanWindow: createGateScanWindowService,
  updateGateScanWindow: updateGateScanWindowService,
  deleteGateScanWindow: deleteGateScanWindowService,
  createAttendanceHoliday: createAttendanceHolidayService,
  deleteAttendanceHoliday: deleteAttendanceHolidayService
} = require('../../services/attendance/settings.service')

const getGateAttendanceSettings = async (req, res) => {
  return getGateAttendanceSettingsService(req, res)
}

const createGateScanWindow = async (req, res) => {
  return createGateScanWindowService(req, res)
}

const updateGateScanWindow = async (req, res) => {
  return updateGateScanWindowService(req, res)
}

const deleteGateScanWindow = async (req, res) => {
  return deleteGateScanWindowService(req, res)
}

const createAttendanceHoliday = async (req, res) => {
  return createAttendanceHolidayService(req, res)
}

const deleteAttendanceHoliday = async (req, res) => {
  return deleteAttendanceHolidayService(req, res)
}
module.exports = {
  getGateAttendanceSettings: getGateAttendanceSettings,
  createGateScanWindow: createGateScanWindow,
  updateGateScanWindow: updateGateScanWindow,
  deleteGateScanWindow: deleteGateScanWindow,
  createAttendanceHoliday: createAttendanceHoliday,
  deleteAttendanceHoliday: deleteAttendanceHoliday
}
