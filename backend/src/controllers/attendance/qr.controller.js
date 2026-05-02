const { createController } = require('../../utils/controllerAdapter')
const {
  generateQR: generateQRService,
  markAttendanceQR: markAttendanceQRService,
  markDailyAttendanceQR: markDailyAttendanceQRService,
  getLiveGateAttendanceQr: getLiveGateAttendanceQrService,
  generateDailyAttendanceQR: generateDailyAttendanceQRService,
  scanStudentIdAttendance: scanStudentIdAttendanceService
} = require('../../services/attendance/qr.service')

const generateQR = createController(generateQRService)
const markAttendanceQR = createController(markAttendanceQRService)
const markDailyAttendanceQR = createController(markDailyAttendanceQRService)
const getLiveGateAttendanceQr = createController(getLiveGateAttendanceQrService)
const generateDailyAttendanceQR = createController(generateDailyAttendanceQRService)
const scanStudentIdAttendance = createController(scanStudentIdAttendanceService)

module.exports = {
  generateQR: generateQR,
  markAttendanceQR: markAttendanceQR,
  markDailyAttendanceQR: markDailyAttendanceQR,
  getLiveGateAttendanceQr: getLiveGateAttendanceQr,
  generateDailyAttendanceQR: generateDailyAttendanceQR,
  scanStudentIdAttendance: scanStudentIdAttendance
}
