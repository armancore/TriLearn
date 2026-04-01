const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  addMarks,
  updateMarks,
  getMarksBySubject,
  getEnrolledStudentsBySubject,
  getMyMarks,
  deleteMarks
} = require('../controllers/marks.controller')

router.use(protect)

// Instructor routes
router.post('/', allowRoles('INSTRUCTOR', 'COORDINATOR'), validate(schemas.marks.create), addMarks)
router.put('/:id', allowRoles('INSTRUCTOR', 'COORDINATOR'), validate(schemas.marks.update), updateMarks)

// Admin + Instructor
router.get('/subject/:subjectId', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR'), validate(schemas.marks.bySubject), getMarksBySubject)
router.get('/subject/:subjectId/students', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR'), validate(schemas.marks.bySubject), getEnrolledStudentsBySubject)
router.delete('/:id', allowRoles('ADMIN'), validate(schemas.marks.id), deleteMarks)

// Student
router.get('/my', allowRoles('STUDENT'), getMyMarks)

module.exports = router
