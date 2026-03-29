const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const {
  createNotice,
  getAllNotices,
  getNoticeById,
  updateNotice,
  deleteNotice
} = require('../controllers/notice.controller')

router.use(protect)

// Admin + Instructor can create/update/delete
router.post('/', allowRoles('ADMIN', 'INSTRUCTOR'), createNotice)
router.put('/:id', allowRoles('ADMIN', 'INSTRUCTOR'), updateNotice)
router.delete('/:id', allowRoles('ADMIN', 'INSTRUCTOR'), deleteNotice)

// Everyone can view
router.get('/', allowRoles('ADMIN', 'INSTRUCTOR', 'STUDENT'), getAllNotices)
router.get('/:id', allowRoles('ADMIN', 'INSTRUCTOR', 'STUDENT'), getNoticeById)

module.exports = router