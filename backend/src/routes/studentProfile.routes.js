const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { attachActorProfiles } = require('../middleware/profile.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const { getStudentProfile } = require('../controllers/studentProfile.controller')

router.use(protect)
router.use(attachActorProfiles)

router.get(
  '/:studentId/profile',
  // Intentional: student self-service profile data comes from /auth/me and
  // /student/profile. This endpoint is only for staff viewing student records.
  allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR'),
  validate(schemas.studentProfile.getById),
  getStudentProfile
)

module.exports = router
