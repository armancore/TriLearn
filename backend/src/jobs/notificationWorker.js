const { errorInfo } = require('../utils/errorInfo')
const { Worker, UnrecoverableError } = require('bullmq')
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const { captureException } = require('../utils/monitoring')
const { sendMail } = require('../utils/mailer')
const { sendPushNotification } = require('../utils/fcm')
const { deleteFile } = require('../utils/fileStorage')
const { emitNotificationCreated } = require('../utils/realtime')
const { createNoticeNotifications } = require('../utils/noticeNotifications')
const {
  NOTIFICATION_QUEUE_NAME,
  CREATE_NOTIFICATIONS_JOB,
  NOTICE_POSTED_JOB,
  PASSWORD_RESET_EMAIL_JOB,
  BULK_STUDENT_IMPORT_JOB,
  ROUTINE_NOTIFICATION_JOB,
  getNotificationQueueConnection
} = require('./notificationQueue')

/** @type {Worker | null} */
let notificationWorker = null

const parsePositiveInteger = (/** @type {string | undefined} */ value, /** @type {number} */ fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const uniqueUserIds = (/** @type {string[]} */ userIds = []) => [...new Set(userIds.filter(Boolean))]

const normalizeNotificationRecords = (/** @type {import("@prisma/client").Prisma.NotificationCreateManyInput[]} */ notifications = []) => notifications
  .filter((notification) => notification?.userId)
  .map((notification) => {
    const safeLink = notification.link && String(notification.link).startsWith('/') ? String(notification.link) : null

    return {
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      link: safeLink,
      metadata: notification.metadata || undefined,
      dedupeKey: notification.dedupeKey || null
    }
  })

const emitCreatedNotifications = async (/** @type {ReturnType<typeof normalizeNotificationRecords>} */ records) => {
  const dedupeKeys = records.map((record) => record.dedupeKey).filter((key) => typeof key === "string")
  if (!dedupeKeys.length) {
    return []
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

  return notifications
}

const buildPushData = (/** @type {import("@prisma/client").Notification} */ notification) => ({
  notificationId: notification.id,
  type: notification.type,
  link: notification.link || '',
  metadata: notification.metadata || {}
})

const removeStaleDeviceTokens = async (/** @type {Awaited<ReturnType<typeof sendPushNotification>>} */ results = []) => {
  const staleTokens = results
    .filter((result) => result?.stale && result.token)
    .map((result) => result.token)

  if (!staleTokens.length || !prisma.deviceToken?.deleteMany) {
    return 0
  }

  const deleteResult = await prisma.deviceToken.deleteMany({
    where: {
      token: {
        in: [...new Set(staleTokens)]
      }
    }
  })

  return deleteResult.count || 0
}

const deliverPushNotifications = async (/** @type {import("@prisma/client").Notification[]} */ notifications = []) => {
  if (!notifications.length || !prisma.deviceToken?.findMany) {
    return { attempted: 0, staleRemoved: 0 }
  }

  const userIds = uniqueUserIds(notifications.map((notification) => notification.userId))
  if (!userIds.length) {
    return { attempted: 0, staleRemoved: 0 }
  }

  const deviceTokens = await prisma.deviceToken.findMany({
    where: {
      userId: {
        in: userIds
      }
    },
    select: {
      userId: true,
      token: true,
      platform: true
    }
  })

  if (!deviceTokens.length) {
    return { attempted: 0, staleRemoved: 0 }
  }

  const tokensByUserId = deviceTokens.reduce((acc, deviceToken) => {
    if (!acc.has(deviceToken.userId)) {
      acc.set(deviceToken.userId, [])
    }
    acc.get(deviceToken.userId).push(deviceToken.token)
    return acc
  }, new Map())

  const pushResults = []

  for (const notification of notifications) {
    const tokens = tokensByUserId.get(notification.userId) || []
    if (!tokens.length) {
      continue
    }

    const results = await sendPushNotification(
      tokens,
      notification.title,
      notification.message,
      buildPushData(notification)
    )
    pushResults.push(...results)
  }

  const staleRemoved = await removeStaleDeviceTokens(pushResults)
  if (staleRemoved > 0) {
    logger.info('Removed stale FCM device tokens', { count: staleRemoved })
  }

  return {
    attempted: pushResults.length,
    staleRemoved
  }
}

const deliverPushNotificationsSafely = async (/** @type {import("@prisma/client").Notification[]} */ notifications, /** @type {string | null} */ requestId = null) => {
  try {
    return await deliverPushNotifications(notifications)
  } catch (error) {
    logger.error('FCM push delivery failed without failing notification job', {
      message: errorInfo(error).message,
      stack: errorInfo(error).stack,
      requestId
    })
    captureException(error, { tags: { job: 'deliverPushNotifications', requestId } })

    return { attempted: 0, staleRemoved: 0, failed: true }
  }
}

const createNotificationRecords = async (/** @type {import("@prisma/client").Prisma.NotificationCreateManyInput[]} */ notifications = [], /** @type {string | null} */ requestId = null) => {
  const records = normalizeNotificationRecords(notifications)
  if (!records.length) {
    return { count: 0 }
  }

  const result = await prisma.notification.createMany({
    data: records,
    skipDuplicates: true
  })

  const createdNotifications = await emitCreatedNotifications(records)
  await deliverPushNotificationsSafely(createdNotifications, requestId)
  return { count: result.count }
}

const processNotificationJob = async (/** @type {import("bullmq").Job} */ job) => {
  if (job.name === NOTICE_POSTED_JOB) {
    return createNoticeNotifications({ notice: job.data.notice })
  }

  if (job.name === CREATE_NOTIFICATIONS_JOB) {
    return createNotificationRecords(job.data.notifications, job.data.requestId)
  }

  if (job.name === ROUTINE_NOTIFICATION_JOB) {
    const { processRoutineNotificationJob } = require('../utils/routineNotifications')
    return processRoutineNotificationJob(job.data)
  }

  if (job.name === PASSWORD_RESET_EMAIL_JOB) {
    const { to, subject, html, text } = job.data
    await sendMail({ to, subject, html, text })
    logger.info('Password reset email sent', {
      jobId: job.id,
      userId: job.data.userId,
      requestId: job.data.requestId || null
    })
    return { sent: true }
  }

  if (job.name === BULK_STUDENT_IMPORT_JOB) {
    const { processStudentImportJob } = require('../services/bulkImport.service')
    return processStudentImportJob(job.data)
  }

  throw new Error(`Unknown notification job: ${job.name}`)
}

const cleanupFailedBulkStudentImportUpload = async (/** @type {import("bullmq").Job | undefined} */ job) => {
  if (job?.name !== BULK_STUDENT_IMPORT_JOB) {
    return
  }

  const filePath = job.data?.file?.path
  const fileName = job.data?.file?.filename

  try {
    await deleteFile(filePath || fileName)

    if (fileName && prisma.uploadedFile?.deleteMany) {
      await prisma.uploadedFile.deleteMany({
        where: { fileName }
      })
    }

    logger.info('Cleaned up failed student import upload', {
      jobId: job.id,
      fileName: fileName || null
    })
  } catch (cleanupError) {
    logger.warn('Failed to clean up student import upload after job failure', {
      jobId: job?.id,
      fileName: fileName || null,
      message: errorInfo(cleanupError).message
    })
  }
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
    if (job && (error instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts || 1))) {
      void cleanupFailedBulkStudentImportUpload(job)
    }

    logger.error('Notification job failed', {
      jobId: job?.id,
      jobName: job?.name,
      requestId: job?.data?.requestId || null,
      message: error.message,
      stack: error.stack
    })
    captureException(error, {
      tags: {
        jobId: job?.id,
        jobName: job?.name,
        requestId: job?.data?.requestId || null
      }
    })
  })

  notificationWorker.on('completed', (job) => {
    if (job.name === BULK_STUDENT_IMPORT_JOB) {
      const { cleanupStudentImportUpload } = require('../services/bulkImport.service')
      void cleanupStudentImportUpload(job.data.file)
    }
  })

  notificationWorker.on('error', (error) => {
    logger.error('Notification worker error', {
      message: error.message,
      stack: error.stack
    })
    captureException(error, { tags: { worker: NOTIFICATION_QUEUE_NAME } })
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
  deliverPushNotifications,
  cleanupFailedBulkStudentImportUpload,
  startNotificationWorker,
  closeNotificationWorker
}
