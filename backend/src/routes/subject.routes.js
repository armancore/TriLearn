const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  createSubject,
  getAllSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
  assignInstructor,
  getSubjectEnrollments,
  updateSubjectEnrollments
} = require('../controllers/subject.controller')

// All routes protected
router.use(protect)

// Admin only
router.post('/', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.subjects.create), createSubject)
router.put('/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.subjects.update), updateSubject)
router.delete('/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.subjects.id), deleteSubject)
router.patch('/:id/assign-instructor', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.subjects.assignInstructor), assignInstructor)
router.get('/:id/enrollments', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR'), validate(schemas.subjects.id), getSubjectEnrollments)
router.put('/:id/enrollments', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.subjects.updateEnrollments), updateSubjectEnrollments)

// Admin + Instructor + Student can view
router.get('/', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR', 'STUDENT'), validate(schemas.subjects.getAll), getAllSubjects)
router.get('/:id', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR', 'STUDENT'), validate(schemas.subjects.id), getSubjectById)

module.exports = router
