const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')
const express = require('express')
const request = require('supertest')

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/edunexus_test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret'
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret'
process.env.QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || 'test-qr-secret'
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const { app } = require('../src/index')

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

test('GET /ping returns an ok response', async () => {
  const response = await request(app).get('/ping')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { status: 'ok' })
})

test('unknown routes return a JSON 404 response', async () => {
  const response = await request(app).get('/definitely-not-a-route')

  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { message: 'Route not found' })
})

test('POST /api/auth/login returns the controller response through the real route', async () => {
  const login = async (req, res) => {
    res.status(200).json({
      message: 'Login successful!',
      token: 'access-token',
      user: {
        id: 'user-1',
        role: 'ADMIN',
        email: req.body.email
      }
    })
  }

  const authRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'auth.routes.js'), {
    '../controllers/auth.controller': {
      register: async (_req, res) => res.status(501).json({ message: 'unused' }),
      submitStudentIntake: async (_req, res) => res.status(501).json({ message: 'unused' }),
      login,
      refresh: async (_req, res) => res.status(501).json({ message: 'unused' }),
      logout: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMe: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getStudentIdQr: async (_req, res) => res.status(501).json({ message: 'unused' }),
      updateProfile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      uploadAvatar: async (_req, res) => res.status(501).json({ message: 'unused' }),
      changePassword: async (_req, res) => res.status(501).json({ message: 'unused' }),
      completeProfile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      forgotPassword: async (_req, res) => res.status(501).json({ message: 'unused' }),
      resetPassword: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getActivity: async (_req, res) => res.status(501).json({ message: 'unused' }),
      logoutAll: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../middleware/auth.middleware': {
      protect: (_req, _res, next) => next(),
      allowRoles: () => (_req, _res, next) => next()
    },
    '../middleware/rateLimit.middleware': {
      authLimiter: (_req, _res, next) => next()
    },
    '../middleware/upload.middleware': {
      uploadImage: {
        single: () => (_req, _res, next) => next()
      },
      validateUploadedImage: (_req, _res, next) => next()
    }
  })

  const testApp = express()
  testApp.use(express.json())
  testApp.use('/api/auth', authRoutes)

  const response = await request(testApp)
    .post('/api/auth/login')
    .send({
      email: 'admin@example.com',
      password: 'Password123'
    })

  assert.equal(response.status, 200)
  assert.equal(response.body.token, 'access-token')
  assert.equal(response.body.user.email, 'admin@example.com')
})

test('GET /api/admin/stats denies instructors through the real admin route', async () => {
  let statsCalled = false

  const adminRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'admin.routes.js'), {
    '../controllers/admin.controller': {
      getAdminStats: async (_req, res) => {
        statsCalled = true
        res.json({ stats: {} })
      },
      getAllUsers: async (_req, res) => res.json({ users: [] }),
      getUserById: async (_req, res) => res.json({ user: null }),
      getStudentApplications: async (_req, res) => res.json({ applications: [] }),
      updateStudentApplicationStatus: async (_req, res) => res.json({}),
      createStudentFromApplication: async (_req, res) => res.json({}),
      deleteStudentApplication: async (_req, res) => res.json({}),
      createCoordinator: async (_req, res) => res.json({}),
      createGatekeeper: async (_req, res) => res.json({}),
      createInstructor: async (_req, res) => res.json({}),
      createStudent: async (_req, res) => res.json({}),
      updateUser: async (_req, res) => res.json({}),
      toggleUserStatus: async (_req, res) => res.json({}),
      deleteUser: async (_req, res) => res.json({})
    },
    '../middleware/auth.middleware': loadWithMocks(resolveFromTest('src', 'middleware', 'auth.middleware.js'), {
      '../utils/prisma': {
        user: {
          findUnique: async () => ({
            id: 'user-instructor-1',
            role: 'INSTRUCTOR',
            isActive: true
          })
        }
      },
      'jsonwebtoken': {
        verify: () => ({
          id: 'user-instructor-1',
          type: 'access'
        })
      },
      '../utils/logger': {
        error: () => {}
      }
    }),
    '../middleware/profile.middleware': {
      attachActorProfiles: (_req, _res, next) => next()
    }
  })

  const testApp = express()
  testApp.use(express.json())
  testApp.use('/api/admin', adminRoutes)

  const response = await request(testApp)
    .get('/api/admin/stats')
    .set('Authorization', 'Bearer fake-access-token')

  assert.equal(response.status, 403)
  assert.deepEqual(response.body, {
    message: 'Access denied. Only ADMIN can do this.'
  })
  assert.equal(statsCalled, false)
})
