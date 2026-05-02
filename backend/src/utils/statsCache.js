const logger = require('./logger')
const { getReadyRedisClient } = require('./redis')

const STATS_CACHE_TTL = 30 * 1000 // 30 seconds
const STATS_CACHE_KEY = 'admin:stats:v1'
const ADMIN_STATS_FIELDS = [
  'totalUsers',
  'totalStudents',
  'totalInstructors',
  'totalCoordinators',
  'totalGatekeepers',
  'totalSubjects'
]
let statsCache = null
let statsCacheExpiresAt = 0

const normalizeCachedAdminStats = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const normalized = {}
  for (const field of ADMIN_STATS_FIELDS) {
    const fieldValue = value[field]
    if (!Number.isSafeInteger(fieldValue) || fieldValue < 0) {
      return null
    }
    normalized[field] = fieldValue
  }

  return normalized
}

const readSharedStatsCache = async () => {
  try {
    const client = await getReadyRedisClient({ context: 'admin stats cache' })
    if (!client) {
      return statsCache && Date.now() < statsCacheExpiresAt ? statsCache : null
    }

    const cachedValue = await client.get(STATS_CACHE_KEY)
    if (!cachedValue) {
      return statsCache && Date.now() < statsCacheExpiresAt ? statsCache : null
    }

    const parsedCache = JSON.parse(cachedValue)
    const normalizedStats = normalizeCachedAdminStats(parsedCache)
    if (!normalizedStats) {
      statsCache = null
      statsCacheExpiresAt = 0
      logger.warn('Ignoring invalid admin stats cache payload from Redis')
      return null
    }

    statsCache = normalizedStats
    statsCacheExpiresAt = Date.now() + STATS_CACHE_TTL
    return normalizedStats
  } catch (error) {
    logger.warn('Failed to read admin stats cache from Redis', { message: error.message })
    return null
  }
}

const writeSharedStatsCache = async (stats) => {
  statsCache = stats
  statsCacheExpiresAt = Date.now() + STATS_CACHE_TTL

  try {
    const client = await getReadyRedisClient({ context: 'admin stats cache' })
    if (!client) {
      return
    }

    await client.set(STATS_CACHE_KEY, JSON.stringify(stats), { PX: STATS_CACHE_TTL })
  } catch (error) {
    logger.warn('Failed to write admin stats cache to Redis', { message: error.message })
  }
}

const clearSharedStatsCache = async () => {
  try {
    const client = await getReadyRedisClient({ context: 'admin stats cache' })
    if (!client) {
      return
    }

    await client.del(STATS_CACHE_KEY)
  } catch (error) {
    logger.warn('Failed to clear admin stats cache in Redis', { message: error.message })
  }
}

const clearStatsCache = () => {
  statsCache = null
  statsCacheExpiresAt = 0
  void clearSharedStatsCache()
}

module.exports = {
  clearStatsCache,
  readSharedStatsCache,
  writeSharedStatsCache,
  STATS_CACHE_KEY,
  STATS_CACHE_TTL,
  ADMIN_STATS_FIELDS
}
