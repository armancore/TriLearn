const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  createRoutine,
  getAllRoutines,
  getRoutineById,
  updateRoutine,
  deleteRoutine
} = require('../controllers/routine.controller')

router.use(protect)

// Admin only - create/update/delete
router.post('/', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.routines.create), createRoutine)
router.put('/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.routines.update), updateRoutine)
router.delete('/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.routines.id), deleteRoutine)

// All roles - view
router.get('/', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR', 'STUDENT'), validate(schemas.routines.getAll), getAllRoutines)
router.get('/:id', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR', 'STUDENT'), validate(schemas.routines.id), getRoutineById)

module.exports = router
