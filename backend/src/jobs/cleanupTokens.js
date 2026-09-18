const { errorInfo } = require('../utils/errorInfo')
const logger = require('../utils/logger')

const cleanupExpiredTokens = async (/** @type {import('@prisma/client').Prisma.TransactionClient} */ prisma) => {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } }
      ]
    }
  })

  if (result.count > 0) {
    logger.info('Expired refresh tokens cleaned up', { deletedCount: result.count })
  }

  return result.count
}

const startTokenCleanupJob = (/** @type {import('@prisma/client').Prisma.TransactionClient} */ prisma) => {
  const intervalMs = Number.parseInt(process.env.REFRESH_TOKEN_CLEANUP_INTERVAL_MS || `${6 * 60 * 60 * 1000}`, 10)
  const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 6 * 60 * 60 * 1000

  const run = async () => {
    try {
      await cleanupExpiredTokens(prisma)
    } catch (error) {
      logger.error('Token cleanup job failed', { message: errorInfo(error).message, stack: errorInfo(error).stack })
    }
  }

  void run()

  const timer = setInterval(() => {
    void run()
  }, safeIntervalMs)
  timer.unref?.()

  return {
    stop: () => clearInterval(timer)
  }
}

module.exports = {
  cleanupExpiredTokens,
  startTokenCleanupJob
}
