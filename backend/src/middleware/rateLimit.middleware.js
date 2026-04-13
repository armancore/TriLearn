const { ipKeyGenerator, rateLimit } = require('express-rate-limit')
const { RedisStore } = require('rate-limit-redis')
const { createClient } = require('redis')

let redisClient
let redisStore
let memoryStoreWarningShown = false
let rateLimitDisabledWarningShown = false

const areRateLimitsDisabled = () => process.env.DISABLE_RATE_LIMITS === 'true'

const getRedisStore = () => {
  const redisUrl = process.env.REDIS_URL

  if (!redisUrl) {
    if (!memoryStoreWarningShown) {
      memoryStoreWarningShown = true
      console.warn('Warning: REDIS_URL not set - rate limiting is using the in-memory store and is not shared across instances')
    }

    return undefined
  }

  if (!redisClient) {
    redisClient = createClient({ url: redisUrl })
    redisClient.on('error', (error) => {
      console.error(`Redis rate limit store error: ${error.message}`)
    })
    redisClient.connect().catch((error) => {
      console.error(`Unable to connect Redis rate limit store: ${error.message}`)
    })
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

const apiLimiter = createLimiter({
  max: 300,
  message: 'Too many requests, please try again later'
})

const authLimiter = createLimiter({
  max: 20,
  message: 'Too many attempts, please try again later'
})

const loginLimiter = createLimiter({
  max: 25,
  message: 'Too many login attempts, please try again later'
})

const refreshLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 60,
  message: 'Too many session refresh attempts, please try again shortly'
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
  loginLimiter,
  refreshLimiter,
  uploadLimiter,
  studentUploadLimiter,
  staffUploadLimiter,
  studentQrScanLimiter,
  dailyQrScanLimiter,
  staffStudentIdScanLimiter
}
