const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/auth.middleware')
const {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead
} = require('../controllers/notification.controller')

router.use(protect)

router.get('/', listNotifications)
router.get('/unread-count', getUnreadNotificationCount)
router.patch('/read-all', markAllNotificationsRead)
router.patch('/:id/read', markNotificationRead)

module.exports = router
