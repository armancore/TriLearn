// Load environment before importing services.
if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line n/no-unpublished-require
  require('dotenv').config()
}

const { createServer } = require('node:http')
const validateEnv = require('./utils/validateEnv')
const prisma = require('./utils/prisma')
const logger = require('./utils/logger')
const { getReadyRedisClient } = require('./utils/redis')
const { initRealtime, closeRealtime } = require('./utils/realtime')
const { notificationQueue } = require('./jobs/notificationQueue')
const { startNotificationWorker, closeNotificationWorker } = require('./jobs/notificationWorker')

const start = async () => {
  validateEnv()
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for a standalone worker')
  const redis = await getReadyRedisClient({ context: 'standalone worker' })
  if (!redis) throw new Error('Redis is unavailable')
  await prisma.$connect()
  // No HTTP listener: join the Redis adapter to publish through the same
  // per-socket authorization checks as embedded workers on API replicas.
  await initRealtime({ server: createServer() })
  const worker = startNotificationWorker()
  if (!worker) throw new Error('Notification worker could not start')
  await worker.waitUntilReady()
  logger.info('Standalone notification worker ready')

  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    try {
      await closeNotificationWorker()
      await notificationQueue.close()
      await closeRealtime()
      await prisma.$disconnect()
      if (redis.isOpen) await redis.quit()
    } catch (error) {
      logger.error('Worker shutdown failed', { error })
      process.exitCode = 1
    }
  }
  process.once('SIGTERM', () => { void stop() })
  process.once('SIGINT', () => { void stop() })
}

if (require.main === module) {
  start().catch((error) => {
    logger.error('Worker startup failed', { message: error.message })
    process.exit(1)
  })
}

module.exports = { start }
