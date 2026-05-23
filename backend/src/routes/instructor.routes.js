const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { attachActorProfiles } = require('../middleware/profile.middleware')
const { getInstructorStudents } = require('../controllers/instructor.controller')

router.use(protect)
router.use(attachActorProfiles)
router.use(allowRoles('INSTRUCTOR'))

router.get('/students', getInstructorStudents)

module.exports = router
