const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { attachActorProfiles } = require('../middleware/profile.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  getAdminStats,
  getAllUsers,
  getUserById,
  getStudentApplications,
  updateStudentApplicationStatus,
  createStudentFromApplication,
  deleteStudentApplication,
  createCoordinator,
  createGatekeeper,
  createInstructor,
  createStudent,
  updateUser,
  toggleUserStatus,
  deleteUser
} = require('../controllers/admin.controller')

router.use(protect)
router.use(attachActorProfiles)

router.get('/stats', allowRoles('ADMIN'), getAdminStats)
router.get('/users', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.getAllUsers), getAllUsers)
router.get('/users/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.userId), getUserById)
router.get('/student-applications', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.getStudentApplications), getStudentApplications)
router.patch('/student-applications/:id/status', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.updateStudentApplicationStatus), updateStudentApplicationStatus)
router.post('/student-applications/:id/create-account', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.createStudentFromApplication), createStudentFromApplication)
router.delete('/student-applications/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.studentApplicationId), deleteStudentApplication)
router.post('/users/coordinator', allowRoles('ADMIN'), validate(schemas.admin.createCoordinator), createCoordinator)
router.post('/users/gatekeeper', allowRoles('ADMIN'), validate(schemas.admin.createGatekeeper), createGatekeeper)
router.post('/users/instructor', allowRoles('ADMIN'), validate(schemas.admin.createInstructor), createInstructor)
router.post('/users/student', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.createStudent), createStudent)
router.put('/users/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.updateUser), updateUser)
router.patch('/users/:id/toggle-status', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.userId), toggleUserStatus)
router.delete('/users/:id', allowRoles('ADMIN'), validate(schemas.admin.userId), deleteUser)

module.exports = router
