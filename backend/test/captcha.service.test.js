const test = require('node:test')
const assert = require('node:assert/strict')

process.env.LOGIN_CAPTCHA_SECRET = 'test-login-captcha-secret'
process.env.NODE_ENV = 'test'

const captchaServicePath = require.resolve('../src/services/captcha.service')
const redisPath = require.resolve('../src/utils/redis')
const { hashToken } = require('../src/utils/token')

const loadCaptchaService = (redisClient) => {
  delete require.cache[captchaServicePath]
  require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: {
      getReadyRedisClient: async () => redisClient
    }
  }
  return require(captchaServicePath)
}

const buildToken = (captchaService, { nonce = 'nonce-1', answer = '7' } = {}) => {
  const payload = {
    email: 'student@example.com',
    nonce,
    answerHash: hashToken(`${nonce}:${answer}`),
    exp: Date.now() + captchaService.LOGIN_CAPTCHA_TTL_MS
  }

  return captchaService.signLoginCaptchaPayload(payload)
}

test('validateLoginCaptcha consumes nonce and rejects replay', async () => {
  const consumedKeys = new Set()
  const setCalls = []
  const redisClient = {
    set: async (key, value, options) => {
      setCalls.push({ key, value, options })
      if (consumedKeys.has(key)) {
        return null
      }

      consumedKeys.add(key)
      return 'OK'
    }
  }
  const captchaService = loadCaptchaService(redisClient)
  const token = buildToken(captchaService)

  const firstUse = await captchaService.validateLoginCaptcha({
    email: 'student@example.com',
    captchaToken: token,
    captchaAnswer: '7'
  })
  const replay = await captchaService.validateLoginCaptcha({
    email: 'student@example.com',
    captchaToken: token,
    captchaAnswer: '7'
  })

  assert.equal(firstUse, true)
  assert.equal(replay, false)
  assert.deepEqual(setCalls[0], {
    key: `${captchaService.LOGIN_CAPTCHA_USED_NONCE_PREFIX}nonce-1`,
    value: '1',
    options: { NX: true, PX: captchaService.LOGIN_CAPTCHA_TTL_MS }
  })
})

test('validateLoginCaptcha does not consume nonce for wrong answer', async () => {
  const setCalls = []
  const redisClient = {
    set: async (key, value, options) => {
      setCalls.push({ key, value, options })
      return 'OK'
    }
  }
  const captchaService = loadCaptchaService(redisClient)
  const token = buildToken(captchaService)

  const isValid = await captchaService.validateLoginCaptcha({
    email: 'student@example.com',
    captchaToken: token,
    captchaAnswer: '8'
  })

  assert.equal(isValid, false)
  assert.equal(setCalls.length, 0)
})

test('validateLoginCaptcha fails closed when Redis is unavailable', async () => {
  const captchaService = loadCaptchaService(null)
  const token = buildToken(captchaService)

  const isValid = await captchaService.validateLoginCaptcha({
    email: 'student@example.com',
    captchaToken: token,
    captchaAnswer: '7'
  })

  assert.equal(isValid, false)
})
