const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { uploadPdf, validateUploadedPdf } = require('../middleware/upload.middleware')
const { uploadLimiter } = require('../middleware/rateLimit.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  createAssignment,
  getAllAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  getMySubmissions,
  gradeSubmission
} = require('../controllers/assignment.controller')

router.use(protect)

// Instructor routes
router.post('/', allowRoles('INSTRUCTOR', 'COORDINATOR'), uploadLimiter, uploadPdf.single('questionPdf'), validateUploadedPdf, validate(schemas.assignments.create), createAssignment)
router.put('/:id', allowRoles('INSTRUCTOR', 'COORDINATOR'), uploadLimiter, uploadPdf.single('questionPdf'), validateUploadedPdf, validate(schemas.assignments.update), updateAssignment)
router.delete('/:id', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.assignments.id), deleteAssignment)
router.patch('/submissions/:submissionId/grade', allowRoles('INSTRUCTOR', 'COORDINATOR'), validate(schemas.assignments.grade), gradeSubmission)

// Student routes
router.post('/:id/submit', allowRoles('STUDENT'), uploadLimiter, uploadPdf.single('answerPdf'), validateUploadedPdf, validate(schemas.assignments.submit), submitAssignment)
router.get('/my-submissions', allowRoles('STUDENT'), getMySubmissions)

// All roles
router.get('/', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR', 'STUDENT'), validate(schemas.assignments.getAll), getAllAssignments)
router.get('/:id', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR', 'STUDENT'), validate(schemas.assignments.id), getAssignmentById)

module.exports = router
