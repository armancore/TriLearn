const prisma = require('./prisma')

const uniqueUserIds = (userIds = []) => [...new Set(userIds.filter(Boolean))]

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

  return prisma.notification.create({
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

  return prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type,
      title,
      message,
      link,
      metadata,
      dedupeKey: typeof dedupeKeyFactory === 'function' ? dedupeKeyFactory(userId) : null
    })),
    skipDuplicates: true
  })
}

module.exports = {
  createNotification,
  createNotifications
}
