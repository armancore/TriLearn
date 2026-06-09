const jwt = require('jsonwebtoken')
const logger = require('./logger')
const { getReadyRedisClient } = require('./redis')
const {
  REVOKED_JTI_PREFIX,
  USER_ACCESS_JTI_PREFIX
} = require('../constants/auth')

const REVOKED_JTI_CACHE_TTL_MS = 60 * 1000
const REVOKED_JTI_CACHE_CLEANUP_MS = 5 * 60 * 1000
// Process-local optimization only: Redis remains the authoritative revocation
// store. In multi-process or multi-replica deployments, a JTI cached in one
// worker is not visible to another until that worker checks Redis.
const revokedJtiCache = new Map()

// REDIS-SAVE: in-memory negative cache avoids Redis EXISTS on every protected request
const cacheRevokedJti = (jti, ttlMs = REVOKED_JTI_CACHE_TTL_MS) => {
  if (!jti || ttlMs <= 0) {
    return
  }

  revokedJtiCache.set(jti, Date.now() + ttlMs)
}

const isRevokedJtiCached = (jti) => {
  const expiresAt = revokedJtiCache.get(jti)
  if (!expiresAt) {
    return false
  }

  if (expiresAt <= Date.now()) {
    revokedJtiCache.delete(jti)
    return false
  }

  return true
}

// REDIS-SAVE: keep the in-memory revocation cache bounded
const revokedJtiCacheCleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [jti, expiresAt] of revokedJtiCache.entries()) {
    if (expiresAt <= now) {
      revokedJtiCache.delete(jti)
    }
  }
}, REVOKED_JTI_CACHE_CLEANUP_MS)

if (typeof revokedJtiCacheCleanupTimer.unref === 'function') {
  revokedJtiCacheCleanupTimer.unref()
}

const getBearerToken = (req) => {
  const [scheme, token] = String(req?.headers?.authorization || '').split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : null
}

const getRemainingTtlSeconds = (exp) => {
  if (!Number.isFinite(exp)) {
    return 0
  }

  return Math.max(0, exp - Math.floor(Date.now() / 1000))
}

const createRevocationUnavailableError = () => Object.assign(
  new Error('Access token revocation store is unavailable'),
  { code: 'ACCESS_TOKEN_REVOCATION_UNAVAILABLE' }
)

const revokeAccessTokenPayload = async (payload, { throwOnFailure = false } = {}) => {
  const jti = payload?.jti
  const ttlSeconds = getRemainingTtlSeconds(payload?.exp)

  if (!jti || ttlSeconds <= 0) {
    return false
  }

  try {
    const redis = await getReadyRedisClient({ context: 'access token revocation' })
    if (!redis) {
      if (throwOnFailure) {
        throw createRevocationUnavailableError()
      }
      return false
    }

    await redis.set(`${REVOKED_JTI_PREFIX}${jti}`, '1', { EX: ttlSeconds })
    cacheRevokedJti(jti, Math.min(ttlSeconds * 1000, REVOKED_JTI_CACHE_TTL_MS))
    return true
  } catch (error) {
    logger.warn('Failed to revoke access token jti in Redis', { message: error.message })
    if (throwOnFailure) {
      throw error
    }
    return false
  }
}

const revokeAccessToken = async (token, options) => {
  if (!token) {
    return false
  }

  const payload = jwt.decode(token)
  return revokeAccessTokenPayload(payload, options)
}

const revokeAccessTokenFromRequest = async (req, options) => {
  if (req?.accessTokenPayload) {
    return revokeAccessTokenPayload(req.accessTokenPayload, options)
  }

  return revokeAccessToken(getBearerToken(req), options)
}

const getUserAccessJtiKey = (userId) => `${USER_ACCESS_JTI_PREFIX}${userId}`

const trackAccessToken = async (token) => {
  const payload = jwt.decode(token)
  const ttlSeconds = getRemainingTtlSeconds(payload?.exp)

  if (!payload?.id || !payload?.jti || ttlSeconds <= 0) {
    return false
  }

  try {
    const redis = await getReadyRedisClient({ context: 'access token tracking' })
    if (!redis) {
      return false
    }

    const userJtiKey = getUserAccessJtiKey(payload.id)
    await redis.sAdd(userJtiKey, `${payload.jti}:${payload.exp}`)
    await redis.expire(userJtiKey, ttlSeconds)
    return true
  } catch (error) {
    logger.warn('Failed to track access token jti in Redis', { message: error.message })
    return false
  }
}

const revokeAllAccessTokensForUser = async (userId, { throwOnFailure = false } = {}) => {
  if (!userId) {
    return 0
  }

  try {
    const redis = await getReadyRedisClient({ context: 'access token revocation' })
    if (!redis) {
      if (throwOnFailure) {
        throw createRevocationUnavailableError()
      }
      return 0
    }

    const userJtiKey = getUserAccessJtiKey(userId)
    const entries = await redis.sMembers(userJtiKey)
    let revokedCount = 0
    const pipeline = typeof redis.multi === 'function' ? redis.multi() : null

    for (const entry of entries) {
      const [jti, expValue] = String(entry).split(':')
      const ttlSeconds = getRemainingTtlSeconds(Number(expValue))

      if (jti && ttlSeconds > 0) {
        if (pipeline) {
          pipeline.set(`${REVOKED_JTI_PREFIX}${jti}`, '1', { EX: ttlSeconds })
        } else {
          await redis.set(`${REVOKED_JTI_PREFIX}${jti}`, '1', { EX: ttlSeconds })
        }
        cacheRevokedJti(jti, Math.min(ttlSeconds * 1000, REVOKED_JTI_CACHE_TTL_MS))
        revokedCount += 1
      }
    }

    if (pipeline && revokedCount > 0) {
      await pipeline.exec()
    }

    if (entries.length > 0) {
      await redis.del(userJtiKey)
    }

    return revokedCount
  } catch (error) {
    logger.warn('Failed to revoke user access token jtis in Redis', { message: error.message, userId })
    if (throwOnFailure) {
      throw error
    }
    return 0
  }
}

module.exports = {
  getBearerToken,
  cacheRevokedJti,
  isRevokedJtiCached,
  revokeAccessToken,
  revokeAccessTokenFromRequest,
  revokeAccessTokenPayload,
  revokeAllAccessTokensForUser,
  trackAccessToken
}
