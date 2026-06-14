const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')

const {
  buildCorsOriginValidator,
  createSocketEventRateLimiter,
  getSocketPacketPayloadSizeBytes,
  isSocketPacketWithinSizeLimit,
  resolveSocketToken
} = require('../src/utils/realtime')

const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret'

const loadWithMocks = (targetPath, mocks) => {
  const modulePath = path.resolve(targetPath)
  const localRequire = createRequire(modulePath)
  const touched = []

  for (const [request, mockExports] of Object.entries(mocks)) {
    const resolved = localRequire.resolve(request)
    touched.push({
      resolved,
      previous: require.cache[resolved]
    })
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: mockExports
    }
  }

  delete require.cache[modulePath]

  try {
    return require(modulePath)
  } finally {
    delete require.cache[modulePath]
    touched.forEach(({ resolved, previous }) => {
      if (previous) {
        require.cache[resolved] = previous
      } else {
        delete require.cache[resolved]
      }
    })
  }
}

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

test('isSocketPacketWithinSizeLimit rejects oversized event payloads', () => {
  assert.equal(isSocketPacketWithinSizeLimit(['event', { value: 'x'.repeat(16) }], 64), true)
  assert.equal(isSocketPacketWithinSizeLimit(['event', { value: 'x'.repeat(128) }], 64), false)
})

test('getSocketPacketPayloadSizeBytes ignores acknowledgement callbacks', () => {
  const withAck = getSocketPacketPayloadSizeBytes(['auth:refresh', { token: 'access-token' }, () => {}])
  const withoutAck = getSocketPacketPayloadSizeBytes(['auth:refresh', { token: 'access-token' }])

  assert.equal(withAck, withoutAck)
})

test('resolveSocketToken accepts the access token cookie', () => {
  const token = resolveSocketToken({
    handshake: {
      auth: {},
      headers: {
        cookie: 'csrfToken=csrf-token; accessToken=cookie-access-token'
      }
    }
  })

  assert.equal(token, 'cookie-access-token')
})

test('verifySocketTokenUser rejects revoked access token jti before user lookup', async () => {
  const { verifySocketTokenUser } = loadWithMocks(resolveFromTest('src', 'utils', 'realtime.js'), {
    'jsonwebtoken': {
      verify: () => ({
        id: 'user-1',
        type: 'access',
        jti: 'revoked-jti'
      })
    },
    './prisma': {
      user: {
        findUnique: async () => {
          throw new Error('user lookup should not run for revoked socket tokens')
        }
      }
    },
    './logger': {
      warn: () => {}
    },
    './redis': {
      isRedisConfigured: () => false,
      getReadyRedisClient: async () => ({
        exists: async (key) => key === 'trilearn:revoked:jti:revoked-jti' ? 1 : 0
      })
    }
  })

  await assert.rejects(
    () => verifySocketTokenUser('revoked-access-token'),
    /Token has been revoked/
  )
})
