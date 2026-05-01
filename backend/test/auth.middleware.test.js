const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')

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

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code
    return this
  },
  json(payload) {
    this.body = payload
    return this
  }
})

test('protect rejects access tokens issued before passwordChangedAt', async () => {
  const { protect } = loadWithMocks(resolveFromTest('src', 'middleware', 'auth.middleware.js'), {
    'jsonwebtoken': {
      verify: () => ({
        id: 'user-1',
        type: 'access',
        iat: 1_710_000_000
      })
    },
    '../utils/prisma': {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          role: 'STUDENT',
          isActive: true,
          passwordChangedAt: new Date((1_710_000_000 + 30) * 1000),
          student: null,
          instructor: null,
          coordinator: null
        })
      }
    },
    '../utils/logger': {
      error: () => {}
    },
    '../utils/redis': {
      getReadyRedisClient: async () => null
    }
  })

  const req = {
    headers: {
      authorization: 'Bearer stale-access-token'
    }
  }
  const res = createResponse()
  let nextCalled = false

  await protect(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, {
    message: 'Password was changed. Please log in again.'
  })
})

test('protect allows access tokens issued after passwordChangedAt', async () => {
  const { protect } = loadWithMocks(resolveFromTest('src', 'middleware', 'auth.middleware.js'), {
    'jsonwebtoken': {
      verify: () => ({
        id: 'user-1',
        type: 'access',
        iat: 1_710_000_100
      })
    },
    '../utils/prisma': {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          role: 'STUDENT',
          isActive: true,
          passwordChangedAt: new Date((1_710_000_000 + 30) * 1000),
          student: {
            id: 'student-1',
            rollNumber: '23-001',
            semester: 3,
            section: 'A',
            department: 'BCA'
          },
          instructor: null,
          coordinator: null
        })
      }
    },
    '../utils/logger': {
      error: () => {}
    },
    '../utils/redis': {
      getReadyRedisClient: async () => null
    }
  })

  const req = {
    headers: {
      authorization: 'Bearer fresh-access-token'
    }
  }
  const res = createResponse()
  let nextCalled = false

  await protect(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 200)
  assert.equal(nextCalled, true)
  assert.equal(req.user.id, 'user-1')
})

test('protect rejects access tokens with a revoked jti', async () => {
  const { protect } = loadWithMocks(resolveFromTest('src', 'middleware', 'auth.middleware.js'), {
    'jsonwebtoken': {
      verify: () => ({
        id: 'user-1',
        type: 'access',
        jti: 'revoked-jti',
        iat: 1_710_000_100
      })
    },
    '../utils/prisma': {
      user: {
        findUnique: async () => {
          throw new Error('user lookup should not run for revoked tokens')
        }
      }
    },
    '../utils/logger': {
      error: () => {}
    },
    '../utils/redis': {
      getReadyRedisClient: async () => ({
        exists: async (key) => key === 'trilearn:revoked:jti:revoked-jti' ? 1 : 0
      })
    }
  })

  const req = {
    headers: {
      authorization: 'Bearer revoked-access-token'
    }
  }
  const res = createResponse()
  let nextCalled = false

  await protect(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, {
    message: 'Token has been revoked'
  })
})
