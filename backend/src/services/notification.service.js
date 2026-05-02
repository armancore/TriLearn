/* eslint-disable no-useless-catch */
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
  try {
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
  } catch (error) {
    throw error
  }
}

/**
 * Handles get unread notification count business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getUnreadNotificationCount = async (context, result = createServiceResponder()) => {
  try {
    const unreadCount = await prisma.notification.count({
      where: {
        userId: context.user.id,
        isRead: false
      }
    })

    result.ok({ unreadCount })
  } catch (error) {
    throw error
  }
}

/**
 * Handles mark notification read business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const markNotificationRead = async (context, result = createServiceResponder()) => {
  try {
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
  } catch (error) {
    throw error
  }
}

/**
 * Handles mark all notifications read business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const markAllNotificationsRead = async (context, result = createServiceResponder()) => {
  try {
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
  } catch (error) {
    throw error
  }
}

/**
 * Handles register device token business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const registerDeviceToken = async (context, result = createServiceResponder()) => {
  try {
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
  } catch (error) {
    throw error
  }
}

/**
 * Handles unregister device token business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const unregisterDeviceToken = async (context, result = createServiceResponder()) => {
  try {
    const { token } = context.body

    await prisma.deviceToken.deleteMany({
      where: {
        userId: context.user.id,
        token
      }
    })

    result.ok({ message: 'Device token removed successfully.' })
  } catch (error) {
    throw error
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
