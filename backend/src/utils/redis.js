const { createClient } = require('redis')
const logger = require('./logger')

let redisClient = null
let redisClientReady = false
let redisConnectPromise = null
const connectionWarningsShown = new Set()

const getRedisUrl = () => String(process.env.REDIS_URL || '').trim()
const isRedisConfigured = () => Boolean(getRedisUrl())

const shouldDisableRedis = () => process.env.NODE_ENV === 'test'

const ensureRedisClient = () => {
  if (shouldDisableRedis() || !isRedisConfigured()) {
    return null
  }

  if (!redisClient) {
    redisClient = createClient({ url: getRedisUrl() })
    redisClient.on('error', (error) => {
      logger.warn('Redis client error', { message: error.message })
    })
  }

  return redisClient
}

const markConnectionWarningShown = (contextKey, message) => {
  if (connectionWarningsShown.has(contextKey)) {
    return
  }

  connectionWarningsShown.add(contextKey)
  logger.warn(message)
}

const connectRedis = async ({ context = 'redis' } = {}) => {
  const client = ensureRedisClient()
  if (!client) {
    return null
  }

  if (redisClientReady) {
    return client
  }

  if (!redisConnectPromise) {
    redisConnectPromise = client.connect()
      .then(() => {
        redisClientReady = true
      })
      .catch((error) => {
        markConnectionWarningShown(
          context,
          `${context}: Redis is unavailable, falling back to in-memory behavior (${error.message})`
        )
        return null
      })
      .finally(() => {
        redisConnectPromise = null
      })
  }

  await redisConnectPromise
  return redisClientReady ? client : null
}

const getRedisClient = ({ context = 'redis' } = {}) => {
  const client = ensureRedisClient()
  if (!client) {
    return null
  }

  void connectRedis({ context })
  return client
}

const getReadyRedisClient = async ({ context = 'redis' } = {}) => {
  const client = ensureRedisClient()
  if (!client) {
    return null
  }

  await connectRedis({ context })
  return redisClientReady ? client : null
}

const warmRedisConnection = async ({ context = 'startup' } = {}) => {
  await connectRedis({ context })
}

module.exports = {
  isRedisConfigured,
  getRedisClient,
  getReadyRedisClient,
  warmRedisConnection
}
