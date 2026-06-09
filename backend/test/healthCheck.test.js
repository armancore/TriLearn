const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')

const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)

const loadWithMocks = (targetPath, mocks) => {
  const modulePath = path.resolve(targetPath)
  const localRequire = createRequire(modulePath)
  const touched = []

  for (const [requestPath, mockExports] of Object.entries(mocks)) {
    const resolved = localRequire.resolve(requestPath)
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

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code
    return this
  },
  json(payload) {
    this.body = payload
    return this
  }
})

const createRequest = ({ ip = '203.0.113.10', healthKey = '' } = {}) => ({
  ip,
  get: (header) => (header.toLowerCase() === 'x-health-check-key' ? healthKey : '')
})

const withEnv = async (patch, fn) => {
  const originalEnv = { ...process.env }
  Object.assign(process.env, patch)

  try {
    await fn()
  } finally {
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    })

    Object.entries(originalEnv).forEach(([key, value]) => {
      process.env[key] = value
    })
  }
}

test('healthCheckHandler verifies Postgres and Redis before reporting healthy', async () => {
  const calls = []
  const { healthCheckHandler } = loadWithMocks(resolveFromTest('src', 'utils', 'healthCheck.js'), {
    './prisma': {
      $queryRaw: async () => {
        calls.push('postgres')
      }
    },
    './redis': {
      isRedisConfigured: () => true,
      getReadyRedisClient: async () => ({
        ping: async () => {
          calls.push('redis')
        }
      })
    }
  })

  await withEnv({
    NODE_ENV: 'production',
    HEALTHCHECK_KEY: 'health-secret',
    REDIS_URL: 'redis://localhost:6379'
  }, async () => {
    const res = createResponse()
    await healthCheckHandler(createRequest({ healthKey: 'health-secret' }), res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, { status: 'ok' })
    assert.deepEqual(calls, ['postgres', 'redis'])
  })
})

test('healthCheckHandler caches successful dependency checks briefly', async () => {
  const calls = []
  const { healthCheckHandler } = loadWithMocks(resolveFromTest('src', 'utils', 'healthCheck.js'), {
    './prisma': {
      $queryRaw: async () => {
        calls.push('postgres')
      }
    },
    './redis': {
      isRedisConfigured: () => false,
      getReadyRedisClient: async () => null
    }
  })

  await withEnv({
    NODE_ENV: 'production',
    HEALTHCHECK_KEY: 'health-secret',
    HEALTHCHECK_CACHE_TTL_MS: '60000'
  }, async () => {
    const first = createResponse()
    const second = createResponse()

    await healthCheckHandler(createRequest({ healthKey: 'health-secret' }), first)
    await healthCheckHandler(createRequest({ healthKey: 'health-secret' }), second)

    assert.equal(first.statusCode, 200)
    assert.equal(second.statusCode, 200)
    assert.deepEqual(calls, ['postgres'])
  })
})

test('healthCheckHandler returns 503 when a dependency check fails', async () => {
  const { healthCheckHandler } = loadWithMocks(resolveFromTest('src', 'utils', 'healthCheck.js'), {
    './prisma': {
      $queryRaw: async () => {
        throw new Error('database unavailable')
      }
    },
    './redis': {
      isRedisConfigured: () => true,
      getReadyRedisClient: async () => ({
        ping: async () => {}
      })
    }
  })

  await withEnv({
    NODE_ENV: 'production',
    HEALTHCHECK_KEY: 'health-secret',
    REDIS_URL: 'redis://localhost:6379'
  }, async () => {
    const res = createResponse()
    await healthCheckHandler(createRequest({ healthKey: 'health-secret' }), res)

    assert.equal(res.statusCode, 503)
    assert.deepEqual(res.body, { status: 'unhealthy' })
  })
})

test('healthCheckHandler caches failed dependency checks briefly', async () => {
  let attempts = 0
  const { healthCheckHandler } = loadWithMocks(resolveFromTest('src', 'utils', 'healthCheck.js'), {
    './prisma': {
      $queryRaw: async () => {
        attempts += 1
        throw new Error('database unavailable')
      }
    },
    './redis': {
      isRedisConfigured: () => false,
      getReadyRedisClient: async () => null
    }
  })

  await withEnv({
    NODE_ENV: 'production',
    HEALTHCHECK_KEY: 'health-secret',
    HEALTHCHECK_CACHE_TTL_MS: '60000'
  }, async () => {
    const first = createResponse()
    const second = createResponse()

    await healthCheckHandler(createRequest({ healthKey: 'health-secret' }), first)
    await healthCheckHandler(createRequest({ healthKey: 'health-secret' }), second)

    assert.equal(first.statusCode, 503)
    assert.equal(second.statusCode, 503)
    assert.equal(attempts, 1)
  })
})

test('healthCheckHandler hides production health checks from public requests without the key', async () => {
  const { healthCheckHandler } = loadWithMocks(resolveFromTest('src', 'utils', 'healthCheck.js'), {
    './prisma': {
      $queryRaw: async () => {
        throw new Error('should not run')
      }
    },
    './redis': {
      isRedisConfigured: () => true,
      getReadyRedisClient: async () => null
    }
  })

  await withEnv({
    NODE_ENV: 'production',
    HEALTHCHECK_KEY: 'health-secret',
    REDIS_URL: 'redis://localhost:6379'
  }, async () => {
    const res = createResponse()
    await healthCheckHandler(createRequest(), res)

    assert.equal(res.statusCode, 404)
    assert.deepEqual(res.body, { message: 'Route not found' })
  })
})

test('healthCheckHandler allows private production probes without the key', async () => {
  const { healthCheckHandler } = loadWithMocks(resolveFromTest('src', 'utils', 'healthCheck.js'), {
    './prisma': {
      $queryRaw: async () => {}
    },
    './redis': {
      isRedisConfigured: () => false,
      getReadyRedisClient: async () => null
    }
  })

  await withEnv({
    NODE_ENV: 'production',
    HEALTHCHECK_KEY: 'health-secret'
  }, async () => {
    const res = createResponse()
    await healthCheckHandler(createRequest({ ip: '10.0.0.5' }), res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, { status: 'ok' })
  })
})
