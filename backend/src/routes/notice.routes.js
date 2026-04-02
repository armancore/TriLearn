const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { attachActorProfiles } = require('../middleware/profile.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  createNotice,
  getAllNotices,
  getNoticeById,
  updateNotice,
  deleteNotice
} = require('../controllers/notice.controller')

router.use(protect)
router.use(attachActorProfiles)

// Admin + Instructor can create/update/delete
router.post('/', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR'), validate(schemas.notices.create), createNotice)
router.put('/:id', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR'), validate(schemas.notices.update), updateNotice)
router.delete('/:id', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR'), validate(schemas.notices.id), deleteNotice)

// Everyone can view
router.get('/', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR', 'STUDENT'), validate(schemas.notices.getAll), getAllNotices)
router.get('/:id', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR', 'STUDENT'), validate(schemas.notices.id), getNoticeById)

module.exports = router
