const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  createDepartment,
  getAllDepartments,
  updateDepartment,
  deleteDepartment
} = require('../controllers/department.controller')

router.get('/', getAllDepartments)

router.use(protect)

router.post('/', allowRoles('ADMIN'), validate(schemas.departments.create), createDepartment)
router.put('/:id', allowRoles('ADMIN'), validate(schemas.departments.update), updateDepartment)
router.delete('/:id', allowRoles('ADMIN'), validate(schemas.departments.id), deleteDepartment)

module.exports = router
