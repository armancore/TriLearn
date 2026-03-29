const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const {
  addMarks,
  updateMarks,
  getMarksBySubject,
  getMyMarks,
  deleteMarks
} = require('../controllers/marks.controller')

router.use(protect)

// Instructor routes
router.post('/', allowRoles('INSTRUCTOR'), addMarks)
router.put('/:id', allowRoles('INSTRUCTOR'), updateMarks)

// Admin + Instructor
router.get('/subject/:subjectId', allowRoles('ADMIN', 'INSTRUCTOR'), getMarksBySubject)
router.delete('/:id', allowRoles('ADMIN'), deleteMarks)

// Student
router.get('/my', allowRoles('STUDENT'), getMyMarks)

module.exports = router