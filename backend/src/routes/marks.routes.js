const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { attachActorProfiles } = require('../middleware/profile.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  addMarks,
  updateMarks,
  getMarksBySubject,
  getMarksReview,
  getEnrolledStudentsBySubject,
  getMyMarks,
  getMyMarksSummary,
  deleteMarks,
  publishMarks
} = require('../controllers/marks.controller')

router.use(protect)
router.use(attachActorProfiles)

// Instructor routes
router.post('/', allowRoles('INSTRUCTOR'), validate(schemas.marks.create), addMarks)
router.put('/:id', allowRoles('INSTRUCTOR'), validate(schemas.marks.update), updateMarks)
router.post('/publish', allowRoles('COORDINATOR'), validate(schemas.marksPublication.publish), publishMarks)
router.get('/review', allowRoles('COORDINATOR'), validate(schemas.marks.review), getMarksReview)

// Admin + Instructor
router.get('/subject/:subjectId', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR'), validate(schemas.marks.bySubject), getMarksBySubject)
router.get('/subject/:subjectId/students', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR'), validate(schemas.marks.bySubject), getEnrolledStudentsBySubject)
router.delete('/:id', allowRoles('ADMIN'), validate(schemas.marks.id), deleteMarks)

// Student
router.get('/my', allowRoles('STUDENT'), getMyMarks)
router.get('/my/summary', allowRoles('STUDENT'), validate(schemas.marks.mySummary), getMyMarksSummary)

module.exports = router
