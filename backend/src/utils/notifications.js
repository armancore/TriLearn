const prisma = require('./prisma')
const { emitNotificationCreated } = require('./realtime')
const {
  CREATE_NOTIFICATIONS_JOB,
  notificationQueue
} = require('../jobs/notificationQueue')

const uniqueUserIds = (userIds = []) => [...new Set(userIds.filter(Boolean))]

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

const dispatchPushNotifications = async ({ userIds }) => {
  if (!process.env.FCM_SERVER_KEY) return { count: 0 }

  // Push delivery is intentionally scaffolded but not yet connected to FCM.
  // For now we count eligible device tokens so the rest of the notification
  // pipeline can be exercised without attempting external delivery.
  const pushTargets = await loadPushTargets(userIds)
  return { count: pushTargets.length }
}

const insertNotificationRecord = async ({
  userId,
  type,
  title,
  message,
  link = null,
  metadata = null,
  dedupeKey = null
}) => prisma.notification.create({
  data: {
    userId,
    type,
    title,
    message,
    link,
    metadata,
    dedupeKey
  }
}).catch((error) => {
  if (error?.code === 'P2002' && dedupeKey) {
    return null
  }

  throw error
})

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

  return insertNotificationRecord({
    userId,
    type,
    title,
    message,
    link,
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

const createNotifications = async ({
  userIds,
  type,
  title,
  message,
  link = null,
  metadata = null,
  dedupeKeyFactory = null
}) => {
  const recipients = uniqueUserIds(userIds)

  if (!recipients.length) {
    return { count: 0 }
  }

  const notifications = recipients.map((userId) => ({
    userId,
    type,
    title,
    message,
    link,
    metadata,
    dedupeKey: typeof dedupeKeyFactory === 'function' ? dedupeKeyFactory(userId) : null
  }))

  const job = await notificationQueue.add(CREATE_NOTIFICATIONS_JOB, {
    notifications
  })

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
