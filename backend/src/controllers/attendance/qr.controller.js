delete require.cache[require.resolve('../../services/attendance/qr.service')]
const {
  generateQR: generateQRService,
  markAttendanceQR: markAttendanceQRService,
  markDailyAttendanceQR: markDailyAttendanceQRService,
  getLiveGateAttendanceQr: getLiveGateAttendanceQrService,
  generateDailyAttendanceQR: generateDailyAttendanceQRService,
  scanStudentIdAttendance: scanStudentIdAttendanceService
} = require('../../services/attendance/qr.service')

const generateQR = async (req, res) => {
  return generateQRService(req, res)
}

const markAttendanceQR = async (req, res) => {
  return markAttendanceQRService(req, res)
}

const markDailyAttendanceQR = async (req, res) => {
  return markDailyAttendanceQRService(req, res)
}

const getLiveGateAttendanceQr = async (req, res) => {
  return getLiveGateAttendanceQrService(req, res)
}

const generateDailyAttendanceQR = async (req, res) => {
  return generateDailyAttendanceQRService(req, res)
}

const scanStudentIdAttendance = async (req, res) => {
  return scanStudentIdAttendanceService(req, res)
}
module.exports = {
  generateQR: generateQR,
  markAttendanceQR: markAttendanceQR,
  markDailyAttendanceQR: markDailyAttendanceQR,
  getLiveGateAttendanceQr: getLiveGateAttendanceQr,
  generateDailyAttendanceQR: generateDailyAttendanceQR,
  scanStudentIdAttendance: scanStudentIdAttendance
}
