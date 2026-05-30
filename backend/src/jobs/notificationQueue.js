const { Queue } = require('bullmq')
const { isRedisConfigured } = require('../utils/redis')
const logger = require('../utils/logger')

const NOTIFICATION_QUEUE_NAME = 'notifications'
const CREATE_NOTIFICATIONS_JOB = 'create-notifications'
const NOTICE_POSTED_JOB = 'notice-posted'
const PASSWORD_RESET_EMAIL_JOB = 'password-reset-email'
const BULK_STUDENT_IMPORT_JOB = 'bulk-student-import'
const ROUTINE_NOTIFICATION_JOB = 'routine-notification'

let queue = null
let redisWarningShown = false

const getRedisUrl = () => String(process.env.REDIS_URL || '').trim()

const normalizeQueueOptions = (options = {}) => {
  if (typeof options.jobId !== 'string' || !options.jobId.includes(':')) {
    return options
  }

  return {
    ...options,
    jobId: options.jobId.replaceAll(':', '-')
  }
}

const getNotificationQueueConnection = () => {
  if (!isRedisConfigured()) {
    if (!redisWarningShown) {
      redisWarningShown = true
      logger.warn('REDIS_URL not set - notification jobs are not queued')
    }

    return null
  }

  return {
    url: getRedisUrl()
  }
}

const getNotificationQueue = () => {
  const connection = getNotificationQueueConnection()
  if (!connection) {
    return null
  }

  if (!queue) {
    queue = new Queue(NOTIFICATION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5_000
        },
        removeOnComplete: 1_000,
        removeOnFail: 5_000
      }
    })
  }

  return queue
}

const notificationQueue = {
  add: async (jobName, payload, options = {}) => {
    const activeQueue = getNotificationQueue()
    if (!activeQueue) {
      return null
    }

    return activeQueue.add(jobName, payload, normalizeQueueOptions(options))
  },
  getJob: async (jobId) => {
    const activeQueue = getNotificationQueue()
    if (!activeQueue) {
      return null
    }

    return activeQueue.getJob(jobId)
  },
  close: async () => {
    if (!queue) {
      return
    }

    await queue.close()
    queue = null
  }
}

module.exports = {
  NOTIFICATION_QUEUE_NAME,
  CREATE_NOTIFICATIONS_JOB,
  NOTICE_POSTED_JOB,
  PASSWORD_RESET_EMAIL_JOB,
  BULK_STUDENT_IMPORT_JOB,
  ROUTINE_NOTIFICATION_JOB,
  getNotificationQueueConnection,
  normalizeQueueOptions,
  notificationQueue
}
