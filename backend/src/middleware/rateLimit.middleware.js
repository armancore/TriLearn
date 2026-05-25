const { ipKeyGenerator, rateLimit } = require('express-rate-limit')
const { RedisStore } = require('rate-limit-redis')
const { hashToken, verifyRefreshToken } = require('../utils/token')
const { isRedisConfigured, getRedisClient } = require('../utils/redis')
const logger = require('../utils/logger')

let memoryStoreWarningShown = false
let rateLimitDisabledWarningShown = false
const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
const LOGIN_LIMIT_WINDOW_MS = parsePositiveInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
const LOGIN_LIMIT_MAX = parsePositiveInteger(process.env.LOGIN_RATE_LIMIT_MAX, 10)

const areRateLimitsDisabled = () => {
  if (process.env.DISABLE_RATE_LIMITS !== 'true') return false
  if (process.env.NODE_ENV === 'production') {
    // Should have been caught by validateEnv, but fail-safe here too
    throw new Error('Rate limits cannot be disabled in production')
  }
  return true
}

const getRedisStore = (prefixSuffix = 'global') => {
  if (!isRedisConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: REDIS_URL is required in production. Rate limiting and session scaling depend on Redis.')
    }

    if (!memoryStoreWarningShown) {
      memoryStoreWarningShown = true
      logger.warn('Rate limiting is using in-memory store (not shared across workers). Configure REDIS_URL for production.')
    }

    return undefined
  }

  const redisClient = getRedisClient({ context: 'rate limit store' })
  if (!redisClient) {
    return undefined
  }

  return new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: `trilearn-rate-limit:${prefixSuffix}:`
  })
}

const createLimiter = ({ max, message, windowMs = 15 * 60 * 1000, keyGenerator, prefixSuffix, useRedisStore = true }) => {
  if (areRateLimitsDisabled()) {
    if (!rateLimitDisabledWarningShown) {
      rateLimitDisabledWarningShown = true
      logger.warn('Rate limiting is DISABLED (DISABLE_RATE_LIMITS=true). This must not be used in production.')
    }

    return (_req, _res, next) => next()
  }

  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message },
    keyGenerator,
    store: useRedisStore ? getRedisStore(prefixSuffix) : undefined
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

const emailRateLimitKey = (req) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  return email || ipKeyGenerator(req.ip || '')
}

const loginRateLimitKey = (req) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  return email || ipKeyGenerator(req.ip || '')
}

const refreshRateLimitKey = (req) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken

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
  prefixSuffix: 'api',
  max: 300,
  message: 'Too many requests, please try again later'
})

const authLimiter = createLimiter({
  prefixSuffix: 'auth',
  max: 20,
  message: 'Too many attempts, please try again later'
})

const authRouterLimiter = createLimiter({
  prefixSuffix: 'auth-router',
  max: 120,
  message: 'Too many authentication requests, please try again later'
})

const forgotPasswordLimiter = createLimiter({
  prefixSuffix: 'forgot-password',
  max: 5,
  message: 'Too many password reset attempts, please try again later',
  keyGenerator: forgotPasswordRateLimitKey
})

const resendVerificationLimiter = createLimiter({
  prefixSuffix: 'resend-verification',
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many verification email requests, please try again later',
  keyGenerator: emailRateLimitKey
})

const loginLimiter = createLimiter({
  prefixSuffix: 'login',
  windowMs: LOGIN_LIMIT_WINDOW_MS,
  max: LOGIN_LIMIT_MAX,
  message: 'Too many login attempts, please try again later',
  keyGenerator: loginRateLimitKey
})

const refreshLimiter = createLimiter({
  prefixSuffix: 'refresh',
  windowMs: 5 * 60 * 1000,
  max: 60,
  message: 'Too many session refresh attempts, please try again shortly',
  keyGenerator: refreshRateLimitKey
})

const logoutLimiter = createLimiter({
  prefixSuffix: 'logout',
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: 'Too many logout attempts, please try again shortly',
  keyGenerator: actorRateLimitKey
})

const uploadLimiter = createLimiter({
  prefixSuffix: 'upload',
  max: 40,
  message: 'Too many upload attempts, please try again later'
})

const studentUploadLimiter = createLimiter({
  prefixSuffix: 'student-upload',
  max: 15,
  message: 'Too many student upload attempts, please try again later'
})

const staffUploadLimiter = createLimiter({
  prefixSuffix: 'staff-upload',
  max: 25,
  message: 'Too many staff upload attempts, please try again later'
})

const studentQrScanLimiter = createLimiter({
  prefixSuffix: 'student-qr-scan',
  windowMs: 5 * 60 * 1000,
  max: 12,
  message: 'Too many attendance QR scan attempts, please wait a moment and try again',
  keyGenerator: actorRateLimitKey
})

const dailyQrScanLimiter = createLimiter({
  prefixSuffix: 'daily-qr-scan',
  windowMs: 5 * 60 * 1000,
  max: 12,
  message: 'Too many daily attendance scan attempts, please wait a moment and try again',
  keyGenerator: actorRateLimitKey
})

const staffStudentIdScanLimiter = createLimiter({
  prefixSuffix: 'staff-student-id-scan',
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: 'Too many student ID scan attempts, please wait a moment and try again',
  keyGenerator: actorRateLimitKey
})

module.exports = {
  apiLimiter,
  authRouterLimiter,
  authLimiter,
  forgotPasswordLimiter,
  forgotPasswordRateLimitKey,
  resendVerificationLimiter,
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
