const crypto = require('crypto')
const logger = require('../utils/logger')
const { normalizeEmail } = require('../utils/adminHelpers')
const { getReadyRedisClient } = require('../utils/redis')
const { hashToken } = require('../utils/token')

const LOGIN_CAPTCHA_THRESHOLD = 3
const LOGIN_CAPTCHA_TTL_MS = 5 * 60 * 1000
const LOGIN_CAPTCHA_USED_NONCE_PREFIX = 'login-captcha:used:'

const getLoginCaptchaSecret = () => {
  const captchaSecret = String(process.env.LOGIN_CAPTCHA_SECRET || '').trim()
  if (captchaSecret) {
    return captchaSecret
  }

  logger.error('Unable to initialize login captcha signing secret because LOGIN_CAPTCHA_SECRET is missing')
  return null
}

const signLoginCaptchaPayload = (payload) => {
  const captchaSecret = getLoginCaptchaSecret()
  if (!captchaSecret) {
    return null
  }

  const encodedPayload = Buffer
    .from(JSON.stringify(payload), 'utf8')
    .toString('base64url')

  const signature = crypto
    .createHmac('sha256', captchaSecret)
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
}

const createLoginCaptchaChallenge = (email) => {
  const left = crypto.randomInt(1, 10)
  const right = crypto.randomInt(1, 10)
  const nonce = crypto.randomUUID()
  const answer = String(left + right)
  const payload = {
    email: normalizeEmail(email),
    nonce,
    answerHash: hashToken(`${nonce}:${answer}`),
    exp: Date.now() + LOGIN_CAPTCHA_TTL_MS
  }
  const token = signLoginCaptchaPayload(payload)
  if (!token) {
    return null
  }

  return {
    prompt: `What is ${left} + ${right}?`,
    token
  }
}

const consumeLoginCaptchaNonce = async (nonce) => {
  if (!nonce) {
    return false
  }

  try {
    const redis = await getReadyRedisClient({ context: 'login captcha nonce consumption' })
    if (!redis) {
      logger.warn('Login captcha validation failed because Redis is unavailable')
      return false
    }

    const result = await redis.set(
      `${LOGIN_CAPTCHA_USED_NONCE_PREFIX}${nonce}`,
      '1',
      { NX: true, PX: LOGIN_CAPTCHA_TTL_MS }
    )

    return result === 'OK'
  } catch (error) {
    logger.warn('Failed to consume login captcha nonce in Redis', { message: error.message })
    return false
  }
}

const validateLoginCaptcha = async ({ email, captchaToken, captchaAnswer }) => {
  const captchaSecret = getLoginCaptchaSecret()
  if (!captchaSecret) {
    return false
  }

  if (!captchaToken || !captchaAnswer) {
    return false
  }

  const [encodedPayload, providedSignature] = String(captchaToken).split('.')
  if (!encodedPayload || !providedSignature) {
    return false
  }

  const expectedSignature = crypto
    .createHmac('sha256', captchaSecret)
    .update(encodedPayload)
    .digest('base64url')

  try {
    if (!crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))) {
      return false
    }
  } catch {
    return false
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    return false
  }

  if (!payload || payload.exp <= Date.now() || payload.email !== normalizeEmail(email)) {
    return false
  }

  const submittedAnswer = String(captchaAnswer).trim()
  if (hashToken(`${payload.nonce}:${submittedAnswer}`) !== payload.answerHash) {
    return false
  }

  return consumeLoginCaptchaNonce(payload.nonce)
}

const shouldRequireLoginCaptcha = (user) => (user?.failedLoginAttempts || 0) >= LOGIN_CAPTCHA_THRESHOLD

const buildLoginCaptchaResponse = (email) => {
  if (getLoginCaptchaSecret() === null) {
    return {
      statusCode: 503,
      body: {
        message: 'Login temporarily unavailable. Please contact support.'
      }
    }
  }

  const captchaChallenge = createLoginCaptchaChallenge(email)
  if (!captchaChallenge) {
    return {
      statusCode: 503,
      body: {
        message: 'Login temporarily unavailable. Please contact support.'
      }
    }
  }

  return {
    statusCode: 401,
    body: {
      message: 'Please complete the security check to continue.',
      requiresCaptcha: true,
      captchaChallenge
    }
  }
}

module.exports = {
  createLoginCaptchaChallenge,
  validateLoginCaptcha,
  signLoginCaptchaPayload,
  getLoginCaptchaSecret,
  shouldRequireLoginCaptcha,
  buildLoginCaptchaResponse,
  LOGIN_CAPTCHA_TTL_MS,
  LOGIN_CAPTCHA_THRESHOLD,
  LOGIN_CAPTCHA_USED_NONCE_PREFIX
}
