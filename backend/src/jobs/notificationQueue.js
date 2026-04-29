const { Queue } = require('bullmq')
const { isRedisConfigured } = require('../utils/redis')

const NOTIFICATION_QUEUE_NAME = 'notifications'
const CREATE_NOTIFICATIONS_JOB = 'create-notifications'
const NOTICE_POSTED_JOB = 'notice-posted'

let queue = null
let redisWarningShown = false

const getRedisUrl = () => String(process.env.REDIS_URL || '').trim()

const getNotificationQueueConnection = () => {
  if (!isRedisConfigured()) {
    if (!redisWarningShown) {
      redisWarningShown = true
      console.warn('Warning: REDIS_URL not set - notification jobs are not queued')
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

    return activeQueue.add(jobName, payload, options)
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
  getNotificationQueueConnection,
  notificationQueue
}
