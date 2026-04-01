const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  generateDailyAttendanceQR,
  generateQR,
  markAttendanceQR,
  markDailyAttendanceQR,
  markAttendanceManual,
  getAttendanceBySubject,
  getCoordinatorDepartmentAttendanceReport,
  getMonthlyAttendanceReport,
  exportAttendanceBySubject,
  getMyAttendance,
  getSubjectRoster
} = require('../controllers/attendance.controller')

router.use(protect)

// Instructor routes
router.post('/generate-daily-qr', allowRoles('GATEKEEPER'), generateDailyAttendanceQR)
router.post('/generate-qr', allowRoles('INSTRUCTOR', 'COORDINATOR'), validate(schemas.attendance.generateQr), generateQR)
router.post('/manual', allowRoles('INSTRUCTOR', 'COORDINATOR'), validate(schemas.attendance.manual), markAttendanceManual)
router.get('/coordinator/department-report', allowRoles('COORDINATOR'), validate(schemas.attendance.coordinatorReport), getCoordinatorDepartmentAttendanceReport)
router.get('/subject/:subjectId/monthly-report', allowRoles('COORDINATOR', 'ADMIN'), validate(schemas.attendance.monthlyReport), getMonthlyAttendanceReport)
router.get('/subject/:subjectId/export', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.attendance.export), exportAttendanceBySubject)
router.get('/subject/:subjectId/roster', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.attendance.getBySubject), getSubjectRoster)
router.get('/subject/:subjectId', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.attendance.getBySubject), getAttendanceBySubject)

// Student routes
router.post('/scan-daily-qr', allowRoles('STUDENT'), validate(schemas.attendance.scanQr), markDailyAttendanceQR)
router.post('/scan-qr', allowRoles('STUDENT'), validate(schemas.attendance.scanQr), markAttendanceQR)
router.get('/my', allowRoles('STUDENT'), getMyAttendance)

module.exports = router
