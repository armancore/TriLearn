const test = require('node:test')
const assert = require('node:assert/strict')

const { buildCorsOriginValidator, createSocketEventRateLimiter } = require('../src/utils/realtime')

const runValidator = (validator, origin) => new Promise((resolve) => {
  validator(origin, (error, allowed) => {
    resolve({ error, allowed })
  })
})

test('buildCorsOriginValidator rejects null origin outside development', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'

  try {
    const validator = buildCorsOriginValidator(['http://localhost:5173'])
    const result = await runValidator(validator, undefined)

    assert.equal(result.allowed, undefined)
    assert.match(result.error?.message || '', /Not allowed by CORS/)
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
  }
})

test('buildCorsOriginValidator rejects null origin in development unless explicitly enabled', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalAllowSocketNoOrigin = process.env.ALLOW_SOCKET_NO_ORIGIN
  process.env.NODE_ENV = 'development'
  delete process.env.ALLOW_SOCKET_NO_ORIGIN

  try {
    const validator = buildCorsOriginValidator(['http://localhost:5173'])
    const result = await runValidator(validator, undefined)

    assert.equal(result.allowed, undefined)
    assert.match(result.error?.message || '', /Not allowed by CORS/)
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }

    if (originalAllowSocketNoOrigin === undefined) {
      delete process.env.ALLOW_SOCKET_NO_ORIGIN
    } else {
      process.env.ALLOW_SOCKET_NO_ORIGIN = originalAllowSocketNoOrigin
    }
  }
})

test('buildCorsOriginValidator allows null origin in development when explicitly enabled', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalAllowSocketNoOrigin = process.env.ALLOW_SOCKET_NO_ORIGIN
  process.env.NODE_ENV = 'development'
  process.env.ALLOW_SOCKET_NO_ORIGIN = 'true'

  try {
    const validator = buildCorsOriginValidator(['http://localhost:5173'])
    const result = await runValidator(validator, undefined)

    assert.equal(result.error, null)
    assert.equal(result.allowed, true)
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }

    if (originalAllowSocketNoOrigin === undefined) {
      delete process.env.ALLOW_SOCKET_NO_ORIGIN
    } else {
      process.env.ALLOW_SOCKET_NO_ORIGIN = originalAllowSocketNoOrigin
    }
  }
})

test('buildCorsOriginValidator allows explicitly trusted origins', async () => {
  const validator = buildCorsOriginValidator(['http://localhost:5173'])
  const result = await runValidator(validator, 'http://localhost:5173')

  assert.equal(result.error, null)
  assert.equal(result.allowed, true)
})

test('createSocketEventRateLimiter blocks bursts above maxEvents within the same window', () => {
  let now = 0
  const limiter = createSocketEventRateLimiter({
    maxEvents: 3,
    windowMs: 1_000,
    now: () => now
  })

  assert.equal(limiter.consume(), true)
  assert.equal(limiter.consume(), true)
  assert.equal(limiter.consume(), true)
  assert.equal(limiter.consume(), false)
})

test('createSocketEventRateLimiter refills tokens over time', () => {
  let now = 0
  const limiter = createSocketEventRateLimiter({
    maxEvents: 2,
    windowMs: 1_000,
    now: () => now
  })

  assert.equal(limiter.consume(), true)
  assert.equal(limiter.consume(), true)
  assert.equal(limiter.consume(), false)

  now = 500
  assert.equal(limiter.consume(), true)
  assert.equal(limiter.consume(), false)

  now = 1000
  assert.equal(limiter.consume(), true)
})
