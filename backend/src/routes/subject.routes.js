const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const {
  createSubject,
  getAllSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
  assignInstructor
} = require('../controllers/subject.controller')

// All routes protected
router.use(protect)

// Admin only
router.post('/', allowRoles('ADMIN'), createSubject)
router.put('/:id', allowRoles('ADMIN'), updateSubject)
router.delete('/:id', allowRoles('ADMIN'), deleteSubject)
router.patch('/:id/assign-instructor', allowRoles('ADMIN'), assignInstructor)

// Admin + Instructor + Student can view
router.get('/', allowRoles('ADMIN', 'INSTRUCTOR', 'STUDENT'), getAllSubjects)
router.get('/:id', allowRoles('ADMIN', 'INSTRUCTOR', 'STUDENT'), getSubjectById)

module.exports = router