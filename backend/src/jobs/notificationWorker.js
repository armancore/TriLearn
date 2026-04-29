const { Worker } = require('bullmq')
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const { emitNotificationCreated } = require('../utils/realtime')
const {
  NOTIFICATION_QUEUE_NAME,
  CREATE_NOTIFICATIONS_JOB,
  NOTICE_POSTED_JOB,
  getNotificationQueueConnection
} = require('./notificationQueue')

let notificationWorker = null

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const uniqueUserIds = (userIds = []) => [...new Set(userIds.filter(Boolean))]

const inferNoticeLink = (role) => (
  role === 'STUDENT'
    ? '/student/notices'
    : role === 'INSTRUCTOR'
      ? '/instructor/notices'
      : role === 'COORDINATOR'
        ? '/coordinator/notices'
        : '/admin/notices'
)

const getNoticeRecipientWhere = (notice) => {
  if (notice.audience === 'INSTRUCTORS_ONLY') {
    return {
      isActive: true,
      role: 'INSTRUCTOR',
      ...(notice.targetDepartment ? {
        instructor: {
          is: {
            OR: [
              { department: notice.targetDepartment },
              {
                departmentMemberships: {
                  some: {
                    department: {
                      is: {
                        name: notice.targetDepartment
                      }
                    }
                  }
                }
              }
            ]
          }
        }
      } : {})
    }
  }

  if (notice.audience === 'STUDENTS') {
    return {
      isActive: true,
      role: 'STUDENT',
      student: {
        is: {
          ...(notice.targetDepartment ? { department: notice.targetDepartment } : {}),
          ...(notice.targetSemester ? { semester: notice.targetSemester } : {})
        }
      }
    }
  }

  return {
    isActive: true
  }
}

const normalizeNotificationRecords = (notifications = []) => notifications
  .filter((notification) => notification?.userId)
  .map((notification) => ({
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: notification.link || null,
    metadata: notification.metadata || null,
    dedupeKey: notification.dedupeKey || null
  }))

const emitCreatedNotifications = async (records) => {
  const dedupeKeys = records.map((record) => record.dedupeKey).filter(Boolean)
  if (!dedupeKeys.length) {
    return
  }

  const notifications = await prisma.notification.findMany({
    where: {
      dedupeKey: {
        in: dedupeKeys
      }
    }
  })

  notifications.forEach((notification) => {
    emitNotificationCreated(notification.userId, notification)
  })
}

const createNotificationRecords = async (notifications = []) => {
  const records = normalizeNotificationRecords(notifications)
  if (!records.length) {
    return { count: 0 }
  }

  const result = await prisma.notification.createMany({
    data: records,
    skipDuplicates: true
  })

  await emitCreatedNotifications(records)
  return { count: result.count }
}

const createNoticeNotifications = async (notice) => {
  const users = await prisma.user.findMany({
    where: {
      ...getNoticeRecipientWhere(notice),
      id: {
        not: notice.postedBy
      }
    },
    select: {
      id: true,
      role: true
    }
  })

  const recipientIds = uniqueUserIds(users.map((user) => user.id))
  const usersById = new Map(users.map((user) => [user.id, user]))

  return createNotificationRecords(recipientIds.map((userId) => {
    const user = usersById.get(userId)

    return {
      userId,
      type: 'NOTICE_POSTED',
      title: notice.title,
      message: notice.content,
      link: inferNoticeLink(user?.role),
      metadata: {
        noticeId: notice.id,
        audience: notice.audience,
        type: notice.type
      },
      dedupeKey: `notice:${notice.id}:${userId}`
    }
  }))
}

const processNotificationJob = async (job) => {
  if (job.name === NOTICE_POSTED_JOB) {
    return createNoticeNotifications(job.data.notice)
  }

  if (job.name === CREATE_NOTIFICATIONS_JOB) {
    return createNotificationRecords(job.data.notifications)
  }

  throw new Error(`Unknown notification job: ${job.name}`)
}

const startNotificationWorker = () => {
  if (notificationWorker) {
    return notificationWorker
  }

  const connection = getNotificationQueueConnection()
  if (!connection) {
    return null
  }

  notificationWorker = new Worker(NOTIFICATION_QUEUE_NAME, processNotificationJob, {
    connection,
    concurrency: parsePositiveInteger(process.env.NOTIFICATION_WORKER_CONCURRENCY, 2)
  })

  notificationWorker.on('failed', (job, error) => {
    logger.error('Notification job failed', {
      jobId: job?.id,
      jobName: job?.name,
      message: error.message,
      stack: error.stack
    })
  })

  notificationWorker.on('error', (error) => {
    logger.error('Notification worker error', {
      message: error.message,
      stack: error.stack
    })
  })

  return notificationWorker
}

const closeNotificationWorker = async () => {
  if (!notificationWorker) {
    return
  }

  await notificationWorker.close()
  notificationWorker = null
}

module.exports = {
  createNotificationRecords,
  startNotificationWorker,
  closeNotificationWorker
}
