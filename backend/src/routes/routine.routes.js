const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const {
  createRoutine,
  getAllRoutines,
  getRoutineById,
  updateRoutine,
  deleteRoutine
} = require('../controllers/routine.controller')

router.use(protect)

// Admin only - create/update/delete
router.post('/', allowRoles('ADMIN'), createRoutine)
router.put('/:id', allowRoles('ADMIN'), updateRoutine)
router.delete('/:id', allowRoles('ADMIN'), deleteRoutine)

// All roles - view
router.get('/', allowRoles('ADMIN', 'INSTRUCTOR', 'STUDENT'), getAllRoutines)
router.get('/:id', allowRoles('ADMIN', 'INSTRUCTOR', 'STUDENT'), getRoutineById)

module.exports = router