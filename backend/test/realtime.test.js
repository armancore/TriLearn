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
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
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

const createLifecycleHarness = async () => {
  const jwt = require('jsonwebtoken')
  const servers = []
  let revoked = false
  let redisReady = true
  const user = { id: 'socket-user', role: 'STUDENT', isActive: true, passwordChangedAt: null }
  class FakeServer {
    constructor() { this.sockets = { sockets: new Map() }; this.handlers = {}; servers.push(this) }
    use(fn) { this.authenticate = fn }
    on(event, fn) { this.handlers[event] = fn }
    adapter() {}
    serverSideEmit(event, ...args) { for (const server of servers) if (server !== this) server.handlers[event](...args) }
    async close() { for (const socket of this.sockets.sockets.values()) socket.disconnect(true) }
  }
  const redis = {
    exists: async () => revoked ? 1 : 0,
    duplicate: () => ({ on() {}, connect: async () => {}, quit: async () => {} })
  }
  const mocks = {
    'socket.io': { Server: FakeServer },
    '@socket.io/redis-adapter': { createAdapter: () => ({}) },
    './prisma': { user: { findUnique: async () => user } },
    './redis': { isRedisConfigured: () => true, getReadyRedisClient: async () => redisReady ? redis : null },
    './accessTokenRevocation': { cacheRevokedJti() {}, isRevokedJtiCached: () => false }
  }
  const modules = [0, 1].map(() => loadWithMocks(resolveFromTest('src', 'utils', 'realtime.js'), mocks))
  await Promise.all(modules.map(module => module.initRealtime({ server: {} })))
  let nextId = 0
  const token = (overrides = {}) => jwt.sign({ id: user.id, role: 'STUDENT', type: 'access', jti: 'jti', iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 60, ...overrides }, process.env.JWT_ACCESS_SECRET)
  const connect = async (index, accessToken = token()) => {
    const server = servers[index]
    const socket = {
      id: String(++nextId), data: {}, connected: true, handshake: { auth: { token: accessToken } }, events: [], handlers: {},
      use(fn) { this.middleware = fn }, join() {}, on(event, fn) { this.handlers[event] = fn },
      emit(event, payload) { this.events.push({ event, payload }) },
      disconnect() { this.connected = false; this.handlers.disconnect?.(); server.sockets.sockets.delete(this.id) }
    }
    await new Promise((resolve, reject) => server.authenticate(socket, error => error ? reject(error) : resolve()))
    server.sockets.sockets.set(socket.id, socket)
    server.handlers.connection(socket)
    return socket
  }
  return { modules, user, token, connect, revoke: () => { revoked = true }, outage: () => { redisReady = false }, close: () => Promise.all(modules.map(m => m.closeRealtime())) }
}

test('local and remote passive listeners are reauthorized before notification delivery', async () => {
  for (const invalidate of ['revoke', 'password', 'disabled', 'outage']) {
    const h = await createLifecycleHarness()
    try {
      const local = await h.connect(0)
      const remote = await h.connect(1)
      await h.modules[0].emitNotificationCreated(h.user.id, { id: 'allowed' })
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(local.events.length, 1)
      assert.equal(remote.events.length, 1)
      if (invalidate === 'password') h.user.passwordChangedAt = new Date()
      else if (invalidate === 'disabled') h.user.isActive = false
      else h[invalidate]()
      await h.modules[0].emitNotificationCreated(h.user.id, { id: 'secret' })
      await new Promise(resolve => setImmediate(resolve))
      for (const socket of [local, remote]) {
        assert.equal(socket.events.length, 1, invalidate)
        assert.equal(socket.connected, false, invalidate)
      }
    } finally { await h.close() }
  }
})

test('socket handshake and auth refresh reject password cutoffs; fresh sessions remain usable', async () => {
  const h = await createLifecycleHarness()
  try {
    const old = h.token()
    const socket = await h.connect(0, old)
    h.user.passwordChangedAt = new Date(Date.now() - 5000)
    await assert.rejects(() => h.connect(1, old), /Password was changed/)
    let ack
    await socket.handlers['auth:refresh']({ token: old }, value => { ack = value })
    assert.deepEqual(ack, { ok: false })
    const fresh = await h.connect(1, h.token({ iat: Math.floor(Date.now() / 1000) }))
    assert.equal(fresh.connected, true)
  } finally { await h.close() }
})

test('token refresh replaces the expiration timer and expired passive sockets disconnect', async () => {
  const h = await createLifecycleHarness()
  try {
    const shortToken = h.token({ exp: Math.floor(Date.now() / 1000) + 1 })
    const expired = await h.connect(0, shortToken)
    const refreshed = await h.connect(1, shortToken)
    await refreshed.handlers['auth:refresh']({ token: h.token() }, () => {})
    await new Promise(resolve => setTimeout(resolve, 1100))
    assert.equal(expired.connected, false)
    assert.equal(refreshed.connected, true)
  } finally { await h.close() }
})
