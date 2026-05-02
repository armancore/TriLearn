const prisma = require('../utils/prisma')
const {
  emitNotificationRead,
  emitNotificationsReadAll
} = require('../utils/realtime')

/**
 * Handles list notifications business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const listNotifications = async (req, response) => {
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

    response.json({ total, page, limit, unreadCount, notifications })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles get unread notification count business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getUnreadNotificationCount = async (req, response) => {
  try {
    const unreadCount = await prisma.notification.count({
      where: {
        userId: req.user.id,
        isRead: false
      }
    })

    response.json({ unreadCount })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles mark notification read business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const markNotificationRead = async (req, response) => {
  try {
    const notification = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    })

    if (!notification) {
      return response.status(404).json({ message: 'Notification not found' })
    }

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: {
        isRead: true,
        readAt: notification.readAt || new Date()
      }
    })

    const unreadCount = await prisma.notification.count({
      where: {
        userId: req.user.id,
        isRead: false
      }
    })

    emitNotificationRead(req.user.id, updated.id, updated.readAt, unreadCount)

    response.json({ notification: updated })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles mark all notifications read business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const markAllNotificationsRead = async (req, response) => {
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

    emitNotificationsReadAll(req.user.id, new Date().toISOString())

    response.json({
      message: 'Notifications marked as read.',
      count: result.count
    })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles register device token business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const registerDeviceToken = async (req, response) => {
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

    response.status(201).json({ message: 'Device token registered successfully.' })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles unregister device token business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const unregisterDeviceToken = async (req, response) => {
  try {
    const { token } = req.body

    await prisma.deviceToken.deleteMany({
      where: {
        userId: req.user.id,
        token
      }
    })

    response.json({ message: 'Device token removed successfully.' })
  } catch (error) {
    response.internalError(error)
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
