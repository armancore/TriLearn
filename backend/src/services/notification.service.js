const { createServiceResponder } = require('../utils/serviceResult')
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
const listNotifications = async (context, result = createServiceResponder()) => {
    const limit = Math.min(Math.max(Number.parseInt(context.query.limit, 10) || 10, 1), 50)
  const page = Math.max(1, Number.parseInt(context.query.page, 10) || 1)
  const skip = (page - 1) * limit
  const unreadOnly = context.query.unreadOnly === 'true'

  const where = {
    userId: context.user.id,
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
        userId: context.user.id,
        isRead: false
      }
    })
  ])

  result.ok({ total, page, limit, unreadCount, notifications })
}

/**
 * Handles get unread notification count business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getUnreadNotificationCount = async (context, result = createServiceResponder()) => {
    const unreadCount = await prisma.notification.count({
    where: {
      userId: context.user.id,
      isRead: false
    }
  })

  result.ok({ unreadCount })
}

/**
 * Handles mark notification read business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const markNotificationRead = async (context, result = createServiceResponder()) => {
    const notification = await prisma.notification.findFirst({
    where: {
      id: context.params.id,
      userId: context.user.id
    }
  })

  if (!notification) {
    return result.withStatus(404, { message: 'Notification not found' })
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
      userId: context.user.id,
      isRead: false
    }
  })

  emitNotificationRead(context.user.id, updated.id, updated.readAt, unreadCount)

  result.ok({ notification: updated })
}

/**
 * Handles mark all notifications read business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const markAllNotificationsRead = async (context, result = createServiceResponder()) => {
    const updateResult = await prisma.notification.updateMany({
    where: {
      userId: context.user.id,
      isRead: false
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  })

  emitNotificationsReadAll(context.user.id, new Date().toISOString())

  result.ok({
    message: 'Notifications marked as read.',
    count: updateResult.count
  })
}

/**
 * Handles register device token business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const registerDeviceToken = async (context, result = createServiceResponder()) => {
    const { token, platform } = context.body

  await prisma.deviceToken.upsert({
    where: { token },
    update: {
      userId: context.user.id,
      platform
    },
    create: {
      userId: context.user.id,
      token,
      platform
    }
  })

  result.withStatus(201, { message: 'Device token registered successfully.' })
}

/**
 * Handles unregister device token business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const unregisterDeviceToken = async (context, result = createServiceResponder()) => {
    const { token } = context.body

  await prisma.deviceToken.deleteMany({
    where: {
      userId: context.user.id,
      token
    }
  })

  result.ok({ message: 'Device token removed successfully.' })
}

module.exports = {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  registerDeviceToken,
  unregisterDeviceToken
}
