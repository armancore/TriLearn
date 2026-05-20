const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { attachActorProfiles } = require('../middleware/profile.middleware')
const { uploadPdf, validateUploadedPdf } = require('../middleware/upload.middleware')
const { studentUploadLimiter, staffUploadLimiter } = require('../middleware/rateLimit.middleware')
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
  gradeSubmission,
  exportAssignmentGrades
} = require('../controllers/assignment.controller')

router.use(protect)
router.use(attachActorProfiles)

// Assignment setup is owned by admins. Staff can review and grade submissions.
router.post('/', allowRoles('ADMIN'), staffUploadLimiter, uploadPdf.single('questionPdf'), validateUploadedPdf, validate(schemas.assignments.create), createAssignment)
router.put('/:id', allowRoles('ADMIN'), staffUploadLimiter, uploadPdf.single('questionPdf'), validateUploadedPdf, validate(schemas.assignments.update), updateAssignment)
router.delete('/:id', allowRoles('ADMIN'), validate(schemas.assignments.id), deleteAssignment)
router.patch('/submissions/:submissionId/grade', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.assignments.grade), gradeSubmission)
router.get('/:id/export', allowRoles('INSTRUCTOR', 'COORDINATOR', 'ADMIN'), validate(schemas.assignments.id), exportAssignmentGrades)

// Student routes
router.post('/:id/submit', allowRoles('STUDENT'), studentUploadLimiter, uploadPdf.single('answerPdf'), validateUploadedPdf, validate(schemas.assignments.submit), submitAssignment)
router.get('/my-submissions', allowRoles('STUDENT'), getMySubmissions)

// All roles
router.get('/', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR', 'STUDENT'), validate(schemas.assignments.getAll), getAllAssignments)
router.get('/:id', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR', 'STUDENT'), validate(schemas.assignments.id), getAssignmentById)

module.exports = router
