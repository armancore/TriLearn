const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { attachActorProfiles } = require('../middleware/profile.middleware')
const { uploadPdf, validateUploadedPdf } = require('../middleware/upload.middleware')
const { studentUploadLimiter, staffUploadLimiter } = require('../middleware/rateLimit.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  submitTask,
  getMyTaskSubmissions,
  reviewTaskSubmission
} = require('../controllers/task.controller')

router.use(protect)
router.use(attachActorProfiles)

router.post('/', allowRoles('INSTRUCTOR'), staffUploadLimiter, uploadPdf.single('questionPdf'), validateUploadedPdf, validate(schemas.tasks.create), createTask)
router.put('/:id', allowRoles('INSTRUCTOR'), staffUploadLimiter, uploadPdf.single('questionPdf'), validateUploadedPdf, validate(schemas.tasks.update), updateTask)
router.delete('/:id', allowRoles('INSTRUCTOR'), validate(schemas.tasks.id), deleteTask)
router.patch('/submissions/:submissionId/feedback', allowRoles('INSTRUCTOR'), validate(schemas.tasks.feedback), reviewTaskSubmission)

router.post('/:id/submit', allowRoles('STUDENT'), studentUploadLimiter, uploadPdf.single('answerPdf'), validateUploadedPdf, validate(schemas.tasks.submit), submitTask)
router.get('/my-submissions', allowRoles('STUDENT'), getMyTaskSubmissions)

router.get('/', allowRoles('INSTRUCTOR', 'STUDENT'), validate(schemas.tasks.getAll), getAllTasks)
router.get('/:id', allowRoles('INSTRUCTOR', 'STUDENT'), validate(schemas.tasks.id), getTaskById)

module.exports = router
