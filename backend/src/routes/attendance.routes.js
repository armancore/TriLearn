const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { attachActorProfiles } = require('../middleware/profile.middleware')
const {
  studentQrScanLimiter,
  dailyQrScanLimiter,
  staffStudentIdScanLimiter
} = require('../middleware/rateLimit.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  markAttendanceManual,
  getAttendanceBySubject,
  getMyAttendance,
  exportMyAttendancePdf,
  getSubjectRoster,
  getCoordinatorDepartmentAttendanceReport,
  getMonthlyAttendanceReport
} = require('../controllers/attendance/attendance.controller')
const {
  exportCoordinatorDepartmentAttendanceReport,
  exportAttendanceBySubject
} = require('../controllers/attendance/export.controller')
const {
  generateDailyAttendanceQR,
  getLiveGateAttendanceQr,
  generateQR,
  markAttendanceQR,
  markDailyAttendanceQR,
  scanStudentIdAttendance
} = require('../controllers/attendance/qr.controller')
const {
  getGateAttendanceSettings,
  createGateScanWindow,
  updateGateScanWindow,
  deleteGateScanWindow,
  createAttendanceHoliday,
  deleteAttendanceHoliday
} = require('../controllers/attendance/settings.controller')
const {
  getMyAbsenceTickets,
  createAbsenceTicket,
  getAbsenceTicketsForStaff,
  reviewAbsenceTicket
} = require('../controllers/attendance/tickets.controller')

router.use(protect)
router.use(attachActorProfiles)

// Instructor routes
router.post('/generate-daily-qr', allowRoles('GATEKEEPER'), generateDailyAttendanceQR)
router.get('/gatekeeper/live-qr', allowRoles('GATEKEEPER'), getLiveGateAttendanceQr)
router.post('/scan-student-id', staffStudentIdScanLimiter, allowRoles('GATEKEEPER', 'INSTRUCTOR', 'COORDINATOR'), validate(schemas.attendance.scanStudentId), scanStudentIdAttendance)
router.get('/gate-settings', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.attendance.gateSettings), getGateAttendanceSettings)
router.post('/gate-settings/windows', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.attendance.createGateWindow), createGateScanWindow)
router.put('/gate-settings/windows/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.attendance.updateGateWindow), updateGateScanWindow)
router.delete('/gate-settings/windows/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.attendance.deleteGateWindow), deleteGateScanWindow)
router.post('/gate-settings/holidays', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.attendance.createHoliday), createAttendanceHoliday)
router.delete('/gate-settings/holidays/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.attendance.deleteHoliday), deleteAttendanceHoliday)
router.post('/generate-qr', allowRoles('INSTRUCTOR', 'COORDINATOR'), validate(schemas.attendance.generateQr), generateQR)
router.post('/manual', allowRoles('INSTRUCTOR', 'COORDINATOR'), validate(schemas.attendance.manual), markAttendanceManual)
router.get('/coordinator/department-report', allowRoles('COORDINATOR'), validate(schemas.attendance.coordinatorReport), getCoordinatorDepartmentAttendanceReport)
router.get('/coordinator/department-report/export', allowRoles('COORDINATOR'), validate(schemas.attendance.coordinatorExport), exportCoordinatorDepartmentAttendanceReport)
router.get('/subject/:subjectId/monthly-report', allowRoles('COORDINATOR', 'ADMIN'), validate(schemas.attendance.monthlyReport), getMonthlyAttendanceReport)
router.get('/subject/:subjectId/export', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.attendance.export), exportAttendanceBySubject)
router.get('/subject/:subjectId/roster', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.attendance.getBySubject), getSubjectRoster)
router.get('/subject/:subjectId', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.attendance.getBySubject), getAttendanceBySubject)

// Student routes
router.post('/scan-daily-qr', dailyQrScanLimiter, allowRoles('STUDENT'), validate(schemas.attendance.scanQr), markDailyAttendanceQR)
router.post('/scan-qr', studentQrScanLimiter, allowRoles('STUDENT'), validate(schemas.attendance.scanQr), markAttendanceQR)
router.get('/my', allowRoles('STUDENT'), getMyAttendance)
router.get('/my/export', allowRoles('STUDENT'), exportMyAttendancePdf)
router.get('/tickets/my', allowRoles('STUDENT'), getMyAbsenceTickets)
router.post('/tickets', allowRoles('STUDENT'), validate(schemas.attendance.createTicket), createAbsenceTicket)

// Staff ticket review routes
router.get('/tickets', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), getAbsenceTicketsForStaff)
router.patch('/tickets/:id', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.attendance.reviewTicket), reviewAbsenceTicket)

module.exports = router
