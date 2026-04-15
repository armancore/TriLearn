const { ipKeyGenerator, rateLimit } = require('express-rate-limit')
const { RedisStore } = require('rate-limit-redis')
const { hashToken, verifyRefreshToken } = require('../utils/token')
const { isRedisConfigured, getRedisClient } = require('../utils/redis')

let redisStore
let memoryStoreWarningShown = false
let rateLimitDisabledWarningShown = false
const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
const LOGIN_LIMIT_WINDOW_MS = parsePositiveInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
const LOGIN_LIMIT_MAX = parsePositiveInteger(process.env.LOGIN_RATE_LIMIT_MAX, 10)

const areRateLimitsDisabled = () => process.env.DISABLE_RATE_LIMITS === 'true'

const getRedisStore = () => {
  if (!isRedisConfigured()) {
    if (!memoryStoreWarningShown) {
      memoryStoreWarningShown = true
      console.warn('Warning: REDIS_URL not set - rate limiting is using the in-memory store and is not shared across instances')
    }

    return undefined
  }

  const redisClient = getRedisClient({ context: 'rate limit store' })
  if (!redisClient) {
    return undefined
  }

  if (!redisStore) {
    redisStore = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'trilearn-rate-limit:'
    })
  }

  return redisStore
}

const createLimiter = ({ max, message, windowMs = 15 * 60 * 1000, keyGenerator }) => {
  if (areRateLimitsDisabled()) {
    if (!rateLimitDisabledWarningShown) {
      rateLimitDisabledWarningShown = true
      console.warn('Warning: rate limiting is disabled because DISABLE_RATE_LIMITS=true')
    }

    return (_req, _res, next) => next()
  }

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    keyGenerator,
    store: getRedisStore()
  })
}

const actorRateLimitKey = (req) => (
  req.user?.id
    ? `${req.user.role || 'USER'}:${req.user.id}`
    : ipKeyGenerator(req.ip || '')
)

const forgotPasswordRateLimitKey = (req) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const ipKey = ipKeyGenerator(req.ip || '')
  return `${ipKey}:${email || 'unknown-email'}`
}

const loginRateLimitKey = (req) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  return email || ipKeyGenerator(req.ip || '')
}

const refreshRateLimitKey = (req) => {
  const refreshToken = req.cookies?.refreshToken

  if (!refreshToken) {
    return ipKeyGenerator(req.ip || '')
  }

  try {
    const decoded = verifyRefreshToken(refreshToken)
    if (decoded?.id) {
      return `refresh-user:${decoded.id}`
    }
  } catch {
    // Fall back to the hashed token value for malformed or expired tokens.
  }

  return `refresh-token:${hashToken(refreshToken)}`
}

const apiLimiter = createLimiter({
  max: 300,
  message: 'Too many requests, please try again later'
})

const authLimiter = createLimiter({
  max: 20,
  message: 'Too many attempts, please try again later'
})

const forgotPasswordLimiter = createLimiter({
  max: 5,
  message: 'Too many password reset attempts, please try again later',
  keyGenerator: forgotPasswordRateLimitKey
})

const loginLimiter = createLimiter({
  windowMs: LOGIN_LIMIT_WINDOW_MS,
  max: LOGIN_LIMIT_MAX,
  message: 'Too many login attempts, please try again later',
  keyGenerator: loginRateLimitKey
})

const refreshLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 60,
  message: 'Too many session refresh attempts, please try again shortly',
  keyGenerator: refreshRateLimitKey
})

const logoutLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: 'Too many logout attempts, please try again shortly',
  keyGenerator: actorRateLimitKey
})

const uploadLimiter = createLimiter({
  max: 40,
  message: 'Too many upload attempts, please try again later'
})

const studentUploadLimiter = createLimiter({
  max: 15,
  message: 'Too many student upload attempts, please try again later'
})

const staffUploadLimiter = createLimiter({
  max: 25,
  message: 'Too many staff upload attempts, please try again later'
})

const studentQrScanLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 12,
  message: 'Too many attendance QR scan attempts, please wait a moment and try again',
  keyGenerator: actorRateLimitKey
})

const dailyQrScanLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 12,
  message: 'Too many daily attendance scan attempts, please wait a moment and try again',
  keyGenerator: actorRateLimitKey
})

const staffStudentIdScanLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: 'Too many student ID scan attempts, please wait a moment and try again',
  keyGenerator: actorRateLimitKey
})

module.exports = {
  apiLimiter,
  authLimiter,
  forgotPasswordLimiter,
  forgotPasswordRateLimitKey,
  loginRateLimitKey,
  loginLimiter,
  refreshLimiter,
  logoutLimiter,
  uploadLimiter,
  studentUploadLimiter,
  staffUploadLimiter,
  studentQrScanLimiter,
  dailyQrScanLimiter,
  staffStudentIdScanLimiter
}
