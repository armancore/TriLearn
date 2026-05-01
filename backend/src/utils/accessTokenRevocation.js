const jwt = require('jsonwebtoken')
const logger = require('./logger')
const { getReadyRedisClient } = require('./redis')
const {
  REVOKED_JTI_PREFIX,
  USER_ACCESS_JTI_PREFIX
} = require('../constants/auth')

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

const revokeAccessTokenPayload = async (payload) => {
  const jti = payload?.jti
  const ttlSeconds = getRemainingTtlSeconds(payload?.exp)

  if (!jti || ttlSeconds <= 0) {
    return false
  }

  try {
    const redis = await getReadyRedisClient({ context: 'access token revocation' })
    if (!redis) {
      return false
    }

    await redis.set(`${REVOKED_JTI_PREFIX}${jti}`, '1', { EX: ttlSeconds })
    return true
  } catch (error) {
    logger.warn('Failed to revoke access token jti in Redis', { message: error.message })
    return false
  }
}

const revokeAccessToken = async (token) => {
  if (!token) {
    return false
  }

  const payload = jwt.decode(token)
  return revokeAccessTokenPayload(payload)
}

const revokeAccessTokenFromRequest = async (req) => {
  if (req?.accessTokenPayload) {
    return revokeAccessTokenPayload(req.accessTokenPayload)
  }

  return revokeAccessToken(getBearerToken(req))
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

const revokeAllAccessTokensForUser = async (userId) => {
  if (!userId) {
    return 0
  }

  try {
    const redis = await getReadyRedisClient({ context: 'access token revocation' })
    if (!redis) {
      return 0
    }

    const userJtiKey = getUserAccessJtiKey(userId)
    const entries = await redis.sMembers(userJtiKey)
    let revokedCount = 0

    for (const entry of entries) {
      const [jti, expValue] = String(entry).split(':')
      const ttlSeconds = getRemainingTtlSeconds(Number(expValue))

      if (jti && ttlSeconds > 0) {
        await redis.set(`${REVOKED_JTI_PREFIX}${jti}`, '1', { EX: ttlSeconds })
        revokedCount += 1
      }
    }

    if (entries.length > 0) {
      await redis.del(userJtiKey)
    }

    return revokedCount
  } catch (error) {
    logger.warn('Failed to revoke user access token jtis in Redis', { message: error.message, userId })
    return 0
  }
}

module.exports = {
  getBearerToken,
  revokeAccessToken,
  revokeAccessTokenFromRequest,
  revokeAccessTokenPayload,
  revokeAllAccessTokensForUser,
  trackAccessToken
}
