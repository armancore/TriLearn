const { errorInfo } = require('./errorInfo')
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
/**
 * @type {Record<string, number> | null}
 */
let statsCache = null
let statsCacheExpiresAt = 0

// Redis is the shared cache across processes. These module-level values are a
// short-lived fallback and are intentionally per Node worker when Redis is down.
const normalizeCachedAdminStats = (/** @type {unknown} */ value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  /** @type {Record<string, number>} */
  const normalized = {}
  for (const field of ADMIN_STATS_FIELDS) {
    const fieldValue = Reflect.get(value, field)
    if (typeof fieldValue !== "number" || !Number.isSafeInteger(fieldValue) || fieldValue < 0) {
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
    logger.warn('Failed to read admin stats cache from Redis', { message: errorInfo(error).message })
    return null
  }
}

const writeSharedStatsCache = async (/** @type {Record<string, number>} */ stats) => {
  statsCache = stats
  statsCacheExpiresAt = Date.now() + STATS_CACHE_TTL

  try {
    const client = await getReadyRedisClient({ context: 'admin stats cache' })
    if (!client) {
      return
    }

    await client.set(STATS_CACHE_KEY, JSON.stringify(stats), { PX: STATS_CACHE_TTL })
  } catch (error) {
    logger.warn('Failed to write admin stats cache to Redis', { message: errorInfo(error).message })
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
    logger.warn('Failed to clear admin stats cache in Redis', { message: errorInfo(error).message })
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
