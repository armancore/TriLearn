const prisma = require('./prisma')
const { emitNotificationCreated } = require('./realtime')
const { hasFcmServiceAccount } = require('./fcm')
const {
  CREATE_NOTIFICATIONS_JOB,
  notificationQueue
} = require('../jobs/notificationQueue')

/** @param {string[]} userIds */
const uniqueUserIds = (userIds = []) => [...new Set(userIds.filter(Boolean))]

/** @param {string[]} userIds */
const loadPushTargets = async (userIds = []) => {
  const recipients = uniqueUserIds(userIds)

  if (!recipients.length || !prisma.deviceToken?.findMany) {
    return []
  }

  return prisma.deviceToken.findMany({
    where: {
      userId: { in: recipients }
    },
    select: {
      userId: true,
      token: true,
      platform: true
    }
  })
}

/** @param {{ userIds: string[] }} options */
const dispatchPushNotifications = async ({ userIds }) => {
  if (!hasFcmServiceAccount()) return { count: 0 }

  // Push delivery is intentionally scaffolded but not yet connected to FCM.
  // For now we count eligible device tokens so the rest of the notification
  // pipeline can be exercised without attempting external delivery.
  const pushTargets = await loadPushTargets(userIds)
  return { count: pushTargets.length }
}

/**
 * @typedef {object} NotificationInput
 * @property {string} userId
 * @property {import('@prisma/client').NotificationType} type
 * @property {string} title
 * @property {string} message
 * @property {string | null} [link]
 * @property {import('@prisma/client').Prisma.InputJsonObject | null} [metadata]
 * @property {string | null} [dedupeKey]
 */
/** @param {NotificationInput} options */
const insertNotificationRecord = async ({
  userId,
  type,
  title,
  message,
  link = null,
  metadata = null,
  dedupeKey = null
}) => {
  const safeLink = link && String(link).startsWith('/') ? String(link) : null

  return prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      link: safeLink,
      metadata: metadata ?? undefined,
      dedupeKey
    }
  }).catch((error) => {
    if (error?.code === 'P2002' && dedupeKey) {
      return null
    }

    throw error
  })
}

/** @param {NotificationInput} options */
const createNotification = async ({
  userId,
  type,
  title,
  message,
  link = null,
  metadata = null,
  dedupeKey = null
}) => {
  if (!userId) {
    return null
  }

  const safeLink = link && String(link).startsWith('/') ? String(link) : null

  return insertNotificationRecord({
    userId,
    type,
    title,
    message,
    link: safeLink,
    metadata,
    dedupeKey
  }).then(async (notification) => {
    if (notification) {
      await dispatchPushNotifications({ userIds: [userId] })
      emitNotificationCreated(userId, notification)
    }

    return notification
  })
}

/** @param {Omit<NotificationInput, 'userId' | 'dedupeKey'> & { userIds: string[], dedupeKeyFactory?: ((userId: string) => string) | null, requestId?: string | null }} options */
const createNotifications = async ({
  userIds,
  type,
  title,
  message,
  link = null,
  metadata = null,
  dedupeKeyFactory = null,
  requestId = null
}) => {
  const recipients = uniqueUserIds(userIds)

  if (!recipients.length) {
    return { count: 0 }
  }

  const safeLink = link && String(link).startsWith('/') ? String(link) : null

  const notifications = recipients.map((userId) => ({
    userId,
    type,
    title,
    message,
    link: safeLink,
    metadata,
    dedupeKey: typeof dedupeKeyFactory === 'function' ? dedupeKeyFactory(userId) : null
  }))

  const job = await notificationQueue.add(CREATE_NOTIFICATIONS_JOB, {
    notifications,
    requestId
  })

  if (!job) {
    const createdNotifications = (await Promise.all(
      notifications.map((notification) => insertNotificationRecord(notification))
    )).filter(notification => notification !== null)

    createdNotifications.forEach((notification) => {
      emitNotificationCreated(notification.userId, notification)
    })
    await dispatchPushNotifications({ userIds: createdNotifications.map((notification) => notification.userId) })

    return {
      count: createdNotifications.length,
      queued: false,
      jobId: null
    }
  }

  return {
    count: recipients.length,
    queued: Boolean(job),
    jobId: job?.id || null
  }
}

module.exports = {
  createNotification,
  createNotifications
}
