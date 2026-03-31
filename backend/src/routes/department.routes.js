const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const {
  createDepartment,
  getAllDepartments,
  updateDepartment,
  deleteDepartment
} = require('../controllers/department.controller')

router.use(protect)

router.get('/', allowRoles('ADMIN', 'INSTRUCTOR'), getAllDepartments)
router.post('/', allowRoles('ADMIN'), createDepartment)
router.put('/:id', allowRoles('ADMIN'), updateDepartment)
router.delete('/:id', allowRoles('ADMIN'), deleteDepartment)

module.exports = router
