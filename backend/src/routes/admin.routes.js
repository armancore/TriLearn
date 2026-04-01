const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  getAllUsers,
  getUserById,
  createCoordinator,
  createGatekeeper,
  createInstructor,
  createStudent,
  updateUser,
  toggleUserStatus,
  deleteUser
} = require('../controllers/admin.controller')

router.use(protect)

router.get('/users', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.getAllUsers), getAllUsers)
router.get('/users/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.userId), getUserById)
router.post('/users/coordinator', allowRoles('ADMIN'), validate(schemas.admin.createCoordinator), createCoordinator)
router.post('/users/gatekeeper', allowRoles('ADMIN'), validate(schemas.admin.createGatekeeper), createGatekeeper)
router.post('/users/instructor', allowRoles('ADMIN'), validate(schemas.admin.createInstructor), createInstructor)
router.post('/users/student', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.createStudent), createStudent)
router.put('/users/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.updateUser), updateUser)
router.patch('/users/:id/toggle-status', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.userId), toggleUserStatus)
router.delete('/users/:id', allowRoles('ADMIN'), validate(schemas.admin.userId), deleteUser)

module.exports = router
