const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { attachActorProfiles } = require('../middleware/profile.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  generateDailyAttendanceQR,
  getLiveGateAttendanceQr,
  generateQR,
  markAttendanceQR,
  markDailyAttendanceQR,
  markAttendanceManual,
  getAttendanceBySubject,
  getCoordinatorDepartmentAttendanceReport,
  exportCoordinatorDepartmentAttendanceReport,
  getMonthlyAttendanceReport,
  exportAttendanceBySubject,
  getMyAttendance,
  getSubjectRoster,
  getMyAbsenceTickets,
  createAbsenceTicket,
  getAbsenceTicketsForStaff,
  reviewAbsenceTicket
} = require('../controllers/attendance.controller')

router.use(protect)
router.use(attachActorProfiles)

// Instructor routes
router.post('/generate-daily-qr', allowRoles('GATEKEEPER'), generateDailyAttendanceQR)
router.get('/gatekeeper/live-qr', allowRoles('GATEKEEPER'), getLiveGateAttendanceQr)
router.post('/generate-qr', allowRoles('INSTRUCTOR', 'COORDINATOR'), validate(schemas.attendance.generateQr), generateQR)
router.post('/manual', allowRoles('INSTRUCTOR', 'COORDINATOR'), validate(schemas.attendance.manual), markAttendanceManual)
router.get('/coordinator/department-report', allowRoles('COORDINATOR'), validate(schemas.attendance.coordinatorReport), getCoordinatorDepartmentAttendanceReport)
router.get('/coordinator/department-report/export', allowRoles('COORDINATOR'), validate(schemas.attendance.coordinatorExport), exportCoordinatorDepartmentAttendanceReport)
router.get('/subject/:subjectId/monthly-report', allowRoles('COORDINATOR', 'ADMIN'), validate(schemas.attendance.monthlyReport), getMonthlyAttendanceReport)
router.get('/subject/:subjectId/export', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.attendance.export), exportAttendanceBySubject)
router.get('/subject/:subjectId/roster', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.attendance.getBySubject), getSubjectRoster)
router.get('/subject/:subjectId', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.attendance.getBySubject), getAttendanceBySubject)

// Student routes
router.post('/scan-daily-qr', allowRoles('STUDENT'), validate(schemas.attendance.scanQr), markDailyAttendanceQR)
router.post('/scan-qr', allowRoles('STUDENT'), validate(schemas.attendance.scanQr), markAttendanceQR)
router.get('/my', allowRoles('STUDENT'), getMyAttendance)
router.get('/tickets/my', allowRoles('STUDENT'), getMyAbsenceTickets)
router.post('/tickets', allowRoles('STUDENT'), validate(schemas.attendance.createTicket), createAbsenceTicket)

// Staff ticket review routes
router.get('/tickets', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), getAbsenceTicketsForStaff)
router.patch('/tickets/:id', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.attendance.reviewTicket), reviewAbsenceTicket)

module.exports = router
