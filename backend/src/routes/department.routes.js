const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { attachActorProfiles } = require('../middleware/profile.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  createDepartment,
  getAllDepartments,
  getDepartmentSections,
  createDepartmentSection,
  deleteDepartmentSection,
  updateDepartment,
  deleteDepartment
} = require('../controllers/department.controller')

router.get('/', protect, attachActorProfiles, getAllDepartments)

router.use(protect)
router.use(attachActorProfiles)

router.post('/', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.departments.create), createDepartment)
router.get('/:id/sections', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.departments.getSections), getDepartmentSections)
router.post('/:id/sections', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.departments.createSection), createDepartmentSection)
router.delete('/:id/sections/:sectionId', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.departments.sectionId), deleteDepartmentSection)
router.put('/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.departments.update), updateDepartment)
router.delete('/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.departments.id), deleteDepartment)

module.exports = router
