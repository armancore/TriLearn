const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')
const express = require('express')
const request = require('supertest')

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/trilearn_test'
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

test('POST /api/v1/auth/login returns the controller response through the real route', async () => {
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
      authLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => next(),
      refreshLimiter: (_req, _res, next) => next(),
      uploadLimiter: (_req, _res, next) => next()
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
  testApp.use('/api/v1/auth', authRoutes)

  const response = await request(testApp)
    .post('/api/v1/auth/login')
    .send({
      email: 'admin@example.com',
      password: 'Password123'
    })

  assert.equal(response.status, 200)
  assert.equal(response.body.token, 'access-token')
  assert.equal(response.body.user.email, 'admin@example.com')
})

test('POST /api/v1/auth/login returns 401 for a wrong password through the real route', async () => {
  const authRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'auth.routes.js'), {
    '../controllers/auth.controller': {
      register: async (_req, res) => res.status(501).json({ message: 'unused' }),
      submitStudentIntake: async (_req, res) => res.status(501).json({ message: 'unused' }),
      login: async (_req, res) => res.status(401).json({ message: 'Invalid credentials' }),
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
      authLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => next(),
      refreshLimiter: (_req, _res, next) => next(),
      uploadLimiter: (_req, _res, next) => next()
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
  testApp.use('/api/v1/auth', authRoutes)

  const response = await request(testApp)
    .post('/api/v1/auth/login')
    .send({
      email: 'admin@example.com',
      password: 'wrong-password'
    })

  assert.equal(response.status, 401)
  assert.deepEqual(response.body, { message: 'Invalid credentials' })
})

test('POST /api/v1/auth/refresh returns a new token when the refresh cookie is valid', async () => {
  const authRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'auth.routes.js'), {
    '../controllers/auth.controller': {
      register: async (_req, res) => res.status(501).json({ message: 'unused' }),
      submitStudentIntake: async (_req, res) => res.status(501).json({ message: 'unused' }),
      login: async (_req, res) => res.status(501).json({ message: 'unused' }),
      refresh: async (_req, res) => res.status(200).json({
        message: 'Token refreshed successfully',
        token: 'new-access-token',
        user: {
          id: 'student-1',
          role: 'STUDENT'
        }
      }),
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
      authLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => next(),
      refreshLimiter: (_req, _res, next) => next(),
      uploadLimiter: (_req, _res, next) => next()
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
  testApp.use('/api/v1/auth', authRoutes)

  const response = await request(testApp)
    .post('/api/v1/auth/refresh')
    .set('Cookie', ['refreshToken=valid-refresh-token'])

  assert.equal(response.status, 200)
  assert.equal(response.body.token, 'new-access-token')
})

test('POST /api/v1/auth/refresh returns 401 when the refresh cookie is missing', async () => {
  const authRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'auth.routes.js'), {
    '../controllers/auth.controller': {
      register: async (_req, res) => res.status(501).json({ message: 'unused' }),
      submitStudentIntake: async (_req, res) => res.status(501).json({ message: 'unused' }),
      login: async (_req, res) => res.status(501).json({ message: 'unused' }),
      refresh: async (_req, res) => res.status(401).json({ message: 'Refresh token is required' }),
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
      authLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => next(),
      refreshLimiter: (_req, _res, next) => next(),
      uploadLimiter: (_req, _res, next) => next()
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
  testApp.use('/api/v1/auth', authRoutes)

  const response = await request(testApp)
    .post('/api/v1/auth/refresh')

  assert.equal(response.status, 401)
  assert.deepEqual(response.body, { message: 'Refresh token is required' })
})

test('GET /api/v1/admin/stats denies instructors through the real admin route', async () => {
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
  testApp.use('/api/v1/admin', adminRoutes)

  const response = await request(testApp)
    .get('/api/v1/admin/stats')
    .set('Authorization', 'Bearer fake-access-token')

  assert.equal(response.status, 403)
  assert.deepEqual(response.body, {
    message: 'Access denied. Only ADMIN can do this.'
  })
  assert.equal(statsCalled, false)
})

test('GET /api/v1/marks/my returns student marks through the real route', async () => {
  let marksCalled = false

  const marksRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'marks.routes.js'), {
    '../controllers/marks.controller': {
      addMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      addMarksBulk: async (_req, res) => res.status(501).json({ message: 'unused' }),
      updateMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMarksBySubject: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMarksReview: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getEnrolledStudentsBySubject: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMyMarks: async (_req, res) => {
        marksCalled = true
        res.json({ marks: [{ id: 'mark-1' }], total: 1 })
      },
      getMyMarksSummary: async (_req, res) => res.status(501).json({ message: 'unused' }),
      exportMyMarksheetPdf: async (_req, res) => res.status(501).json({ message: 'unused' }),
      deleteMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      publishMarks: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../middleware/auth.middleware': {
      protect: (req, _res, next) => {
        req.user = { id: 'user-student-1', role: 'STUDENT' }
        next()
      },
      allowRoles: (...roles) => (req, res, next) => (
        roles.includes(req.user.role)
          ? next()
          : res.status(403).json({ message: `Access denied. Only ${roles.join(', ')} can do this.` })
      )
    },
    '../middleware/profile.middleware': {
      attachActorProfiles: (req, _res, next) => {
        req.student = { id: 'student-1' }
        next()
      }
    },
    '../middleware/validate.middleware': {
      validate: () => (_req, _res, next) => next()
    }
  })

  const testApp = express()
  testApp.use(express.json())
  testApp.use('/api/v1/marks', marksRoutes)

  const response = await request(testApp).get('/api/v1/marks/my')

  assert.equal(response.status, 200)
  assert.equal(marksCalled, true)
  assert.equal(response.body.total, 1)
})

test('GET /api/v1/marks/my denies instructors through the real route', async () => {
  let marksCalled = false

  const marksRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'marks.routes.js'), {
    '../controllers/marks.controller': {
      addMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      addMarksBulk: async (_req, res) => res.status(501).json({ message: 'unused' }),
      updateMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMarksBySubject: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMarksReview: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getEnrolledStudentsBySubject: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMyMarks: async (_req, res) => {
        marksCalled = true
        res.json({ marks: [] })
      },
      getMyMarksSummary: async (_req, res) => res.status(501).json({ message: 'unused' }),
      exportMyMarksheetPdf: async (_req, res) => res.status(501).json({ message: 'unused' }),
      deleteMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      publishMarks: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../middleware/auth.middleware': {
      protect: (req, _res, next) => {
        req.user = { id: 'user-instructor-1', role: 'INSTRUCTOR' }
        next()
      },
      allowRoles: (...roles) => (req, res, next) => (
        roles.includes(req.user.role)
          ? next()
          : res.status(403).json({ message: `Access denied. Only ${roles.join(', ')} can do this.` })
      )
    },
    '../middleware/profile.middleware': {
      attachActorProfiles: (_req, _res, next) => next()
    },
    '../middleware/validate.middleware': {
      validate: () => (_req, _res, next) => next()
    }
  })

  const testApp = express()
  testApp.use(express.json())
  testApp.use('/api/v1/marks', marksRoutes)

  const response = await request(testApp).get('/api/v1/marks/my')

  assert.equal(response.status, 403)
  assert.equal(marksCalled, false)
  assert.deepEqual(response.body, {
    message: 'Access denied. Only STUDENT can do this.'
  })
})

test('POST /api/v1/marks/bulk reaches the bulk marks controller for instructors', async () => {
  let bulkCalled = false

  const marksRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'marks.routes.js'), {
    '../controllers/marks.controller': {
      addMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      addMarksBulk: async (_req, res) => {
        bulkCalled = true
        res.status(201).json({ count: 2 })
      },
      updateMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMarksBySubject: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMarksReview: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getEnrolledStudentsBySubject: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMyMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMyMarksSummary: async (_req, res) => res.status(501).json({ message: 'unused' }),
      exportMyMarksheetPdf: async (_req, res) => res.status(501).json({ message: 'unused' }),
      deleteMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      publishMarks: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../middleware/auth.middleware': {
      protect: (req, _res, next) => {
        req.user = { id: 'user-instructor-1', role: 'INSTRUCTOR' }
        next()
      },
      allowRoles: (...roles) => (req, res, next) => (
        roles.includes(req.user.role)
          ? next()
          : res.status(403).json({ message: `Access denied. Only ${roles.join(', ')} can do this.` })
      )
    },
    '../middleware/profile.middleware': {
      attachActorProfiles: (req, _res, next) => {
        req.instructor = { id: 'instructor-1' }
        next()
      }
    },
    '../middleware/validate.middleware': {
      validate: () => (_req, _res, next) => next()
    }
  })

  const testApp = express()
  testApp.use(express.json())
  testApp.use('/api/v1/marks', marksRoutes)

  const response = await request(testApp)
    .post('/api/v1/marks/bulk')
    .send({
      subjectId: 'subject-1',
      examType: 'MIDTERM',
      totalMarks: 100,
      entries: [
        { studentId: 'student-1', obtainedMarks: 88, remarks: 'Good' },
        { studentId: 'student-2', obtainedMarks: 76, remarks: '' }
      ]
    })

  assert.equal(response.status, 201)
  assert.equal(bulkCalled, true)
  assert.equal(response.body.count, 2)
})
