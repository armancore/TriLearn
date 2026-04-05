const prisma = require('../utils/prisma')

const listNotifications = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 50)
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const skip = (page - 1) * limit
    const unreadOnly = req.query.unreadOnly === 'true'

    const where = {
      userId: req.user.id,
      ...(unreadOnly ? { isRead: false } : {})
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          userId: req.user.id,
          isRead: false
        }
      })
    ])

    res.json({ total, page, limit, unreadCount, notifications })
  } catch (error) {
    res.internalError(error)
  }
}

const getUnreadNotificationCount = async (req, res) => {
  try {
    const unreadCount = await prisma.notification.count({
      where: {
        userId: req.user.id,
        isRead: false
      }
    })

    res.json({ unreadCount })
  } catch (error) {
    res.internalError(error)
  }
}

const markNotificationRead = async (req, res) => {
  try {
    const notification = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    })

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' })
    }

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: {
        isRead: true,
        readAt: notification.readAt || new Date()
      }
    })

    res.json({ notification: updated })
  } catch (error) {
    res.internalError(error)
  }
}

const markAllNotificationsRead = async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    })

    res.json({
      message: 'Notifications marked as read.',
      count: result.count
    })
  } catch (error) {
    res.internalError(error)
  }
}

const registerDeviceToken = async (req, res) => {
  try {
    const { token, platform } = req.body

    await prisma.deviceToken.upsert({
      where: { token },
      update: {
        userId: req.user.id,
        platform
      },
      create: {
        userId: req.user.id,
        token,
        platform
      }
    })

    res.status(201).json({ message: 'Device token registered successfully.' })
  } catch (error) {
    res.internalError(error)
  }
}

const unregisterDeviceToken = async (req, res) => {
  try {
    const { token } = req.body

    await prisma.deviceToken.deleteMany({
      where: {
        userId: req.user.id,
        token
      }
    })

    res.json({ message: 'Device token removed successfully.' })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  registerDeviceToken,
  unregisterDeviceToken
}
