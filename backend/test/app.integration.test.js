const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')
const express = require('express')
const cookieParser = require('cookie-parser')
const request = require('supertest')

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/trilearn_test'
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret'.repeat(3)
process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test-csrf-secret'.repeat(3)
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret'.repeat(3)
process.env.LOGIN_CAPTCHA_SECRET = process.env.LOGIN_CAPTCHA_SECRET || 'test-login-captcha-secret'.repeat(2)
process.env.QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || 'test-qr-secret'.repeat(3)
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const trustedOrigin = process.env.FRONTEND_URL
const { app } = require('../src/index')
const { enforceHttps } = require('../src/middleware/enforceHttps.middleware')
const { attachCsrfCookie, csrfProtection, generateCsrfToken } = require('../src/middleware/csrf.middleware')
const { validateMobileClient } = require('../src/middleware/mobileClient.middleware')
const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)
const passThroughLimiter = (_req, _res, next) => next()

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

test('GET /health returns only a minimal public status payload', async () => {
  const response = await request(app)
    .get('/health')
    .set('Origin', trustedOrigin)

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { status: 'ok' })
})

test('GET /health remains public for external uptime checks without a health check key', async () => {
  const response = await request(app)
    .get('/health')
    .set('Origin', trustedOrigin)
    .set('X-Forwarded-For', '203.0.113.10')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { status: 'ok' })
})

test('GET /ping is not exposed as a second unauthenticated health endpoint', async () => {
  const response = await request(app)
    .get('/ping')
    .set('Origin', trustedOrigin)

  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { code: 'ROUTE_NOT_FOUND', message: 'Route not found' })
})

test('oversized JSON requests return a user-friendly 413 response', async () => {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', trustedOrigin)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ email: 'student@example.com', password: 'x'.repeat(1_100_000) }))

  assert.equal(response.status, 413)
  assert.deepEqual(response.body, {
    code: 'REQUEST_BODY_TOO_LARGE',
    message: 'Request body is too large. Upload large student datasets as a spreadsheet file.'
  })
})

test('serveUploadedFile route enforces uploaded file authorization matrix', async () => {
  const auditCalls = []
  const buildTestApp = (user, prismaOverrides) => {
    delete require.cache[require.resolve('../src/services/upload.service.js')]
    const { serveUploadedFile } = loadWithMocks(resolveFromTest('src', 'controllers', 'upload.controller.js'), {
      '../utils/prisma': {
        uploadedFile: { findUnique: async () => null },
        user: { findFirst: async () => null },
        assignment: { findFirst: async () => null },
        submission: { findFirst: async () => null },
        studyMaterial: { findFirst: async () => null },
        ...prismaOverrides
      },
      '../utils/fileStorage': {
        uploadPath: path.resolve('test-uploads'),
        uploadPublicPath: '/api/v1/uploads'
      },
      '../utils/audit': {
        recordAuditLog: async (payload) => {
          auditCalls.push(payload)
        }
      },
      '../middleware/csrf.middleware': {
        getTrustedOrigins: () => []
      }
    })

    const testApp = express()
    testApp.use((req, res, next) => {
      req.user = user
      res.sendFile = (filePath, options) => res.status(200).json({
        filePath,
        contentType: options.headers['Content-Type']
      })
      next()
    })
    testApp.get('/api/v1/uploads/:filename', serveUploadedFile)
    return testApp
  }

  const ownerResponse = await request(buildTestApp(
    { id: 'owner-user-1', role: 'STUDENT' },
    {
      uploadedFile: {
        findUnique: async () => ({ id: 'file-1', uploadedById: 'owner-user-1' })
      }
    }
  )).get('/api/v1/uploads/private.pdf')

  assert.equal(ownerResponse.status, 200)
  assert.match(ownerResponse.body.filePath, /private\.pdf$/)

  const deniedResponse = await request(buildTestApp(
    { id: 'other-user-1', role: 'STUDENT' },
    {
      uploadedFile: {
        findUnique: async () => ({ id: 'file-1', uploadedById: 'owner-user-1' })
      }
    }
  )).get('/api/v1/uploads/private.pdf')

  assert.equal(deniedResponse.status, 403)
  assert.deepEqual(deniedResponse.body, { message: 'Access denied' })

  const adminResponse = await request(buildTestApp(
    { id: 'admin-user-1', role: 'ADMIN' },
    {
      uploadedFile: {
        findUnique: async () => ({ id: 'file-1', uploadedById: 'owner-user-1' })
      }
    }
  )).get('/api/v1/uploads/private.pdf')

  assert.equal(adminResponse.status, 200)

  const entityResponse = await request(buildTestApp(
    { id: 'student-user-1', role: 'STUDENT', student: { id: 'student-1' } },
    {
      uploadedFile: {
        findUnique: async () => ({
          id: 'file-1',
          uploadedById: 'instructor-user-1',
          entityType: 'ASSIGNMENT',
          entityId: 'assignment-1'
        })
      },
      assignment: {
        findUnique: async () => ({
          id: 'assignment-1',
          subjectId: 'subject-1',
          instructorId: 'instructor-1'
        })
      },
      subjectEnrollment: {
        findUnique: async () => ({ id: 'enrollment-1' })
      }
    }
  )).get('/api/v1/uploads/assignment.pdf')

  assert.equal(entityResponse.status, 200)
  assert.equal(entityResponse.body.contentType, 'application/pdf')
  assert.equal(auditCalls.some((entry) => entry.action === 'UPLOAD_FILE_ACCESS_DENIED'), true)
})

test('enforceHttps blocks insecure production requests', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'

  try {
    const testApp = express()
    testApp.use(enforceHttps)
    testApp.get('/api/v1/auth/me', (_req, res) => res.json({ ok: true }))

    const response = await request(testApp).get('/api/v1/auth/me')

    assert.equal(response.status, 400)
    assert.deepEqual(response.body, { message: 'HTTPS is required' })
  } finally {
    process.env.NODE_ENV = originalNodeEnv
  }
})

test('enforceHttps allows forwarded HTTPS production requests', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'

  try {
    const testApp = express()
    testApp.use(enforceHttps)
    testApp.get('/api/v1/auth/me', (_req, res) => res.json({ ok: true }))

    const response = await request(testApp)
      .get('/api/v1/auth/me')
      .set('X-Forwarded-Proto', 'https')

    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { ok: true })
  } finally {
    process.env.NODE_ENV = originalNodeEnv
  }
})

test('enforceHttps exempts health and docs routes in production', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'

  try {
    const testApp = express()
    testApp.use(enforceHttps)
    testApp.get('/health', (_req, res) => res.json({ status: 'ok' }))
    testApp.get('/api/docs', (_req, res) => res.json({ docs: true }))

    const healthResponse = await request(testApp).get('/health')
    const docsResponse = await request(testApp).get('/api/docs')

    assert.equal(healthResponse.status, 200)
    assert.deepEqual(healthResponse.body, { status: 'ok' })
    assert.equal(docsResponse.status, 200)
    assert.deepEqual(docsResponse.body, { docs: true })
  } finally {
    process.env.NODE_ENV = originalNodeEnv
  }
})

test('validateMobileClient rejects mobile endpoints without version headers', async () => {
  const testApp = express()
  testApp.use(validateMobileClient)
  testApp.post('/auth/refresh/mobile', (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/auth/refresh/mobile')
    .set('X-Client-Type', 'mobile')

  assert.equal(response.status, 400)
  assert.deepEqual(response.body, { message: 'Missing mobile client headers.' })
})

test('validateMobileClient rejects mobile app versions below MIN_MOBILE_VERSION', async () => {
  const originalMinMobileVersion = process.env.MIN_MOBILE_VERSION
  process.env.MIN_MOBILE_VERSION = '2.0.0'

  try {
    const testApp = express()
    testApp.use(validateMobileClient)
    testApp.post('/auth/refresh/mobile', (_req, res) => res.json({ ok: true }))

    const response = await request(testApp)
      .post('/auth/refresh/mobile')
      .set('X-Client-Type', 'mobile')
      .set('X-App-Version', '1.9.9')

    assert.equal(response.status, 426)
    assert.deepEqual(response.body, {
      message: 'Please update the TriLearn app',
      minVersion: '2.0.0'
    })
  } finally {
    if (originalMinMobileVersion === undefined) {
      delete process.env.MIN_MOBILE_VERSION
    } else {
      process.env.MIN_MOBILE_VERSION = originalMinMobileVersion
    }
  }
})

test('validateMobileClient records valid mobile app versions on the request logger', async () => {
  const logContext = []
  const testApp = express()
  testApp.use((req, _res, next) => {
    req.logger = {
      child: (context) => {
        logContext.push(context)
        return req.logger
      }
    }
    next()
  })
  testApp.use(validateMobileClient)
  testApp.post('/auth/refresh/mobile', (req, res) => res.json({ version: req.mobileAppVersion }))

  const response = await request(testApp)
    .post('/auth/refresh/mobile')
    .set('X-Client-Type', 'mobile')
    .set('X-App-Version', '1.2.3')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { version: '1.2.3' })
  assert.deepEqual(logContext, [{ mobileAppVersion: '1.2.3' }])
})

test('csrfProtection rejects spoofed mobile bearer requests when browser cookies are present', async () => {
  const testApp = express()
  testApp.use(csrfProtection)
  testApp.post('/api/v1/subjects', passThroughLimiter, (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/api/v1/subjects')
    .set('Authorization', 'Bearer access-token')
    .set('X-Client-Type', 'mobile')
    .set('X-Client-Signature', 'a'.repeat(64))
    .set('X-App-Version', '1.2.3')
    .set('X-Client-Version', '1.2.3')
    .set('X-App-Platform', 'ios')
    .set('Origin', 'https://evil.example')
    .set('Sec-Fetch-Site', 'cross-site')
    .set('Cookie', ['refreshToken=web-refresh-token'])

  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'CSRF validation failed' })
})

test('GET /api/v1/auth/csrf issues a signed token for trusted browser origins', async () => {
  const testApp = express()
  testApp.use(cookieParser())
  testApp.use(csrfProtection)
  testApp.get('/api/v1/auth/csrf', (req, res) => {
    res.json({ csrfToken: req.csrfToken || req.cookies?.csrfToken || attachCsrfCookie(res, req) })
  })

  const response = await request(testApp)
    .get('/api/v1/auth/csrf')
    .set('Origin', trustedOrigin)

  assert.equal(response.status, 200)
  assert.match(response.body.csrfToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  assert.equal(
    response.headers['set-cookie'].some((cookie) => cookie.startsWith(`csrfToken=${response.body.csrfToken};`)),
    true
  )
})

test('generateCsrfToken requires the dedicated CSRF_SECRET', () => {
  const originalCsrfSecret = process.env.CSRF_SECRET
  delete process.env.CSRF_SECRET

  try {
    assert.throws(() => generateCsrfToken(), /CSRF_SECRET must be configured/)
  } finally {
    if (originalCsrfSecret === undefined) {
      delete process.env.CSRF_SECRET
    } else {
      process.env.CSRF_SECRET = originalCsrfSecret
    }
  }
})

test('app-level csrf middleware rejects unsafe cookie-backed browser requests without a CSRF token', async () => {
  const response = await request(app)
    .post('/api/v1/auth/logout')
    .set('Origin', trustedOrigin)
    .set('Cookie', ['refreshToken=web-refresh-token'])

  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'CSRF validation failed' })
})

test('csrfProtection allows trusted browser requests with a matching signed CSRF token', async () => {
  const csrfToken = generateCsrfToken()
  const testApp = express()
  testApp.use(cookieParser())
  testApp.use(csrfProtection)
  testApp.post('/api/v1/subjects', (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/api/v1/subjects')
    .set('Origin', trustedOrigin)
    .set('Cookie', [`csrfToken=${csrfToken}; refreshToken=web-refresh-token`])
    .set('X-CSRF-Token', csrfToken)

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { ok: true })
})

test('csrfProtection rejects trusted browser requests without a matching CSRF token', async () => {
  const csrfToken = generateCsrfToken()
  const testApp = express()
  testApp.use(cookieParser())
  testApp.use(csrfProtection)
  testApp.post('/api/v1/subjects', (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/api/v1/subjects')
    .set('Origin', trustedOrigin)
    .set('Cookie', [`csrfToken=${csrfToken}; refreshToken=web-refresh-token`])
    .set('X-CSRF-Token', generateCsrfToken())

  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'CSRF validation failed' })
})

test('csrfProtection allows native mobile bearer requests without browser context', async () => {
  const testApp = express()
  testApp.use(csrfProtection)
  testApp.post('/api/v1/subjects', passThroughLimiter, (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/api/v1/subjects')
    .set('Authorization', 'Bearer access-token')
    .set('X-Client-Type', 'mobile')
    .set('X-App-Version', '1.2.3')
    .set('X-Client-Version', '1.2.3')
    .set('X-App-Platform', 'ios')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { ok: true })
})

test('csrfProtection rejects no-origin bearer requests without mobile metadata', async () => {
  const testApp = express()
  testApp.use(csrfProtection)
  testApp.post('/api/v1/subjects', passThroughLimiter, (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/api/v1/subjects')
    .set('Authorization', 'Bearer access-token')

  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'CSRF validation failed' })
})

test('csrfProtection rejects unsafe requests without browser origin context or bearer token', async () => {
  const testApp = express()
  testApp.use(csrfProtection)
  testApp.post('/api/v1/auth/logout-all', passThroughLimiter, (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/api/v1/auth/logout-all')

  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'CSRF validation failed' })
})

test('csrfProtection allows native mobile login requests with Expo origin and no cookies', async () => {
  const testApp = express()
  testApp.use(csrfProtection)
  testApp.post('/api/v1/auth/login', passThroughLimiter, (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/api/v1/auth/login')
    .set('X-Client-Type', 'mobile')
    .set('X-App-Version', '1.2.3')
    .set('X-Client-Version', '1.2.3')
    .set('X-App-Platform', 'ios')
    .set('Origin', 'exp://192.168.1.81:8081')
    .send({ email: 'student@example.com', password: 'Password123' })

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { ok: true })
})

test('csrfProtection rejects spoofed mobile login requests from untrusted browser origins', async () => {
  const testApp = express()
  testApp.use(csrfProtection)
  testApp.post('/api/v1/auth/login', passThroughLimiter, (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/api/v1/auth/login')
    .set('X-Client-Type', 'mobile')
    .set('X-App-Version', '1.2.3')
    .set('X-Client-Version', '1.2.3')
    .set('Origin', 'https://evil.example')
    .send({ email: 'student@example.com', password: 'Password123' })

  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'CSRF validation failed' })
})

test('csrfProtection allows mobile login before version metadata validation', async () => {
  const testApp = express()
  testApp.use(csrfProtection)
  testApp.post('/api/v1/auth/login', passThroughLimiter, (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/api/v1/auth/login')
    .set('X-Client-Type', 'mobile')
    .set('Origin', 'exp://192.168.1.81:8081')
    .send({ email: 'student@example.com', password: 'Password123' })

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { ok: true })
})

test('csrfProtection rejects mobile login requests with stale cookies', async () => {
  const testApp = express()
  testApp.use(csrfProtection)
  testApp.post('/api/v1/auth/login', passThroughLimiter, (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/api/v1/auth/login')
    .set('X-Client-Type', 'mobile')
    .set('X-App-Version', '1.2.3')
    .set('X-Client-Version', '1.2.3')
    .set('X-App-Platform', 'ios')
    .set('Origin', 'exp://192.168.1.81:8081')
    .set('Cookie', ['refreshToken=stale-web-refresh-token'])
    .send({ email: 'student@example.com', password: 'Password123' })

  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'CSRF validation failed' })
})

test('csrfProtection rejects mobile API requests with stale cookies even when mobile headers are present', async () => {
  const testApp = express()
  testApp.use(csrfProtection)
  testApp.post('/api/v1/attendance/scan-qr', passThroughLimiter, (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/api/v1/attendance/scan-qr')
    .set('Authorization', 'Bearer access-token')
    .set('X-Client-Type', 'mobile')
    .set('X-App-Version', '1.2.3')
    .set('X-Client-Version', '1.2.3')
    .set('X-App-Platform', 'ios')
    .set('Origin', 'exp://192.168.1.81:8081')
    .set('Cookie', ['refreshToken=stale-web-refresh-token'])
    .send({ qrData: 'qr-payload' })

  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'CSRF validation failed' })
})

test('csrfProtection rejects unsigned mobile API requests with stale cookies', async () => {
  const testApp = express()
  testApp.use(csrfProtection)
  testApp.post('/api/v1/attendance/scan-qr', passThroughLimiter, (_req, res) => res.json({ ok: true }))

  const response = await request(testApp)
    .post('/api/v1/attendance/scan-qr')
    .set('Authorization', 'Bearer access-token')
    .set('X-Client-Type', 'mobile')
    .set('X-App-Version', '1.2.3')
    .set('Origin', 'https://evil.example')
    .set('Cookie', ['refreshToken=stale-web-refresh-token'])
    .send({ qrData: 'qr-payload' })

  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'CSRF validation failed' })
})

test('GET / responds with the generic not found payload', async () => {
  const response = await request(app)
    .get('/')
    .set('Origin', trustedOrigin)

  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { code: 'ROUTE_NOT_FOUND', message: 'Route not found' })
})

test('unknown routes return a JSON 404 response', async () => {
  const response = await request(app)
    .get('/definitely-not-a-route')
    .set('Origin', trustedOrigin)

  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { code: 'ROUTE_NOT_FOUND', message: 'Route not found' })
})

test('getErrorMessage hides internal exception text even when DEBUG_ERRORS is enabled', async () => {
  const { getErrorMessage } = require('../src/index')
  const originalDebugErrors = process.env.DEBUG_ERRORS
  const originalNodeEnv = process.env.NODE_ENV

  try {
    process.env.NODE_ENV = 'development'
    delete process.env.DEBUG_ERRORS
    assert.equal(
      getErrorMessage(new Error("Invalid value for argument 'where'."), 'Something went wrong'),
      'Something went wrong'
    )

    process.env.DEBUG_ERRORS = 'true'
    assert.equal(
      getErrorMessage(new Error("Invalid value for argument 'where'."), 'Something went wrong'),
      'Something went wrong'
    )
  } finally {
    if (originalDebugErrors === undefined) {
      delete process.env.DEBUG_ERRORS
    } else {
      process.env.DEBUG_ERRORS = originalDebugErrors
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
  }
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
      refreshMobile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      verifyEmail: async (_req, res) => res.status(501).json({ message: 'unused' }),
      resendVerification: async (_req, res) => res.status(501).json({ message: 'unused' }),
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
      forgotPasswordLimiter: (_req, _res, next) => next(),
      resendVerificationLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => next(),
      refreshLimiter: (_req, _res, next) => next(),
      logoutLimiter: (_req, _res, next) => next(),
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

test('POST /api/v1/auth/login runs the auth router limiter before the login limiter', async () => {
  const calls = []

  const authRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'auth.routes.js'), {
    '../controllers/auth.controller': {
      register: async (_req, res) => res.status(501).json({ message: 'unused' }),
      submitStudentIntake: async (_req, res) => res.status(501).json({ message: 'unused' }),
      login: async (_req, res) => {
        calls.push('controller')
        res.status(200).json({ message: 'ok' })
      },
      refresh: async (_req, res) => res.status(501).json({ message: 'unused' }),
      refreshMobile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      verifyEmail: async (_req, res) => res.status(501).json({ message: 'unused' }),
      resendVerification: async (_req, res) => res.status(501).json({ message: 'unused' }),
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
      authRouterLimiter: (_req, _res, next) => {
        calls.push('authRouterLimiter')
        next()
      },
      authLimiter: (_req, _res, next) => next(),
      forgotPasswordLimiter: (_req, _res, next) => next(),
      resendVerificationLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => {
        calls.push('loginLimiter')
        next()
      },
      refreshLimiter: (_req, _res, next) => next(),
      logoutLimiter: (_req, _res, next) => next(),
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
  assert.deepEqual(calls, ['authRouterLimiter', 'loginLimiter', 'controller'])
})

test('POST /api/v1/auth/login returns 401 for a wrong password through the real route', async () => {
  const authRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'auth.routes.js'), {
    '../controllers/auth.controller': {
      register: async (_req, res) => res.status(501).json({ message: 'unused' }),
      submitStudentIntake: async (_req, res) => res.status(501).json({ message: 'unused' }),
      login: async (_req, res) => res.status(401).json({ message: 'Invalid credentials' }),
      refresh: async (_req, res) => res.status(501).json({ message: 'unused' }),
      refreshMobile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      verifyEmail: async (_req, res) => res.status(501).json({ message: 'unused' }),
      resendVerification: async (_req, res) => res.status(501).json({ message: 'unused' }),
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
      forgotPasswordLimiter: (_req, _res, next) => next(),
      resendVerificationLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => next(),
      refreshLimiter: (_req, _res, next) => next(),
      logoutLimiter: (_req, _res, next) => next(),
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

test('GET /api/v1/departments/public returns public department options without auth', async () => {
  let protectCalled = false
  const departmentRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'department.routes.js'), {
    '../controllers/department.controller': {
      createDepartment: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getAllDepartments: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getPublicDepartments: async (_req, res) => res.json({
        total: 1,
        departments: [{ id: 'department-1', name: 'BCA', code: 'BCA' }]
      }),
      getDepartmentSections: async (_req, res) => res.status(501).json({ message: 'unused' }),
      createDepartmentSection: async (_req, res) => res.status(501).json({ message: 'unused' }),
      deleteDepartmentSection: async (_req, res) => res.status(501).json({ message: 'unused' }),
      updateDepartment: async (_req, res) => res.status(501).json({ message: 'unused' }),
      deleteDepartment: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../middleware/auth.middleware': {
      protect: (_req, _res, next) => {
        protectCalled = true
        next()
      },
      allowRoles: () => (_req, _res, next) => next()
    },
    '../middleware/profile.middleware': {
      attachActorProfiles: (_req, _res, next) => next()
    },
    '../middleware/validate.middleware': {
      validate: () => (_req, _res, next) => next()
    },
    '../validators/schemas': {
      schemas: {
        departments: {
          create: {},
          getSections: {},
          createSection: {},
          sectionId: {},
          update: {},
          id: {}
        }
      }
    }
  })

  const testApp = express()
  testApp.use('/api/v1/departments', departmentRoutes)

  const response = await request(testApp).get('/api/v1/departments/public')

  assert.equal(response.status, 200)
  assert.equal(protectCalled, false)
  assert.deepEqual(response.body, {
    total: 1,
    departments: [{ id: 'department-1', name: 'BCA', code: 'BCA' }]
  })
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
      refreshMobile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      verifyEmail: async (_req, res) => res.status(501).json({ message: 'unused' }),
      resendVerification: async (_req, res) => res.status(501).json({ message: 'unused' }),
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
      forgotPasswordLimiter: (_req, _res, next) => next(),
      resendVerificationLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => next(),
      refreshLimiter: (_req, _res, next) => next(),
      logoutLimiter: (_req, _res, next) => next(),
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
      refreshMobile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      verifyEmail: async (_req, res) => res.status(501).json({ message: 'unused' }),
      resendVerification: async (_req, res) => res.status(501).json({ message: 'unused' }),
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
      forgotPasswordLimiter: (_req, _res, next) => next(),
      resendVerificationLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => next(),
      refreshLimiter: (_req, _res, next) => next(),
      logoutLimiter: (_req, _res, next) => next(),
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

test('refreshLimiter keys refresh attempts by decoded user id before falling back to token hash', () => {
  const capturedConfigs = []

  loadWithMocks(resolveFromTest('src', 'middleware', 'rateLimit.middleware.js'), {
    'express-rate-limit': {
      ipKeyGenerator: (ip) => `ip:${ip}`,
      rateLimit: (config) => {
        capturedConfigs.push(config)
        return (_req, _res, next) => next()
      }
    },
    'rate-limit-redis': {
      RedisStore: class RedisStore {}
    },
    '../utils/redis': {
      isRedisConfigured: () => true,
      getRedisClient: () => ({
        sendCommand: async () => {}
      })
    },
    '../utils/token': {
      hashToken: (token) => `hash:${token}`,
      verifyRefreshToken: (token) => {
        if (token === 'valid-refresh-token') {
          return { id: 'user-123' }
        }

        throw new Error('invalid token')
      }
    }
  })

  const refreshConfig = capturedConfigs.find((config) => config.message?.message === 'Too many session refresh attempts, please try again shortly')

  assert.ok(refreshConfig)
  assert.equal(refreshConfig.keyGenerator({
    cookies: { refreshToken: 'valid-refresh-token' },
    body: {},
    ip: '198.51.100.10'
  }), 'refresh-user:user-123')
  assert.equal(refreshConfig.keyGenerator({
    cookies: { refreshToken: 'garbled-token' },
    body: {},
    ip: '198.51.100.10'
  }), 'refresh-token:hash:garbled-token')
})

test('POST /api/v1/auth/logout runs the logout limiter before the controller', async () => {
  let logoutLimiterCalled = false

  const authRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'auth.routes.js'), {
    '../controllers/auth.controller': {
      register: async (_req, res) => res.status(501).json({ message: 'unused' }),
      submitStudentIntake: async (_req, res) => res.status(501).json({ message: 'unused' }),
      login: async (_req, res) => res.status(501).json({ message: 'unused' }),
      refresh: async (_req, res) => res.status(501).json({ message: 'unused' }),
      refreshMobile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      verifyEmail: async (_req, res) => res.status(501).json({ message: 'unused' }),
      resendVerification: async (_req, res) => res.status(501).json({ message: 'unused' }),
      logout: async (_req, res) => res.status(200).json({ message: 'Logged out successfully' }),
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
      forgotPasswordLimiter: (_req, _res, next) => next(),
      resendVerificationLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => next(),
      refreshLimiter: (_req, _res, next) => next(),
      logoutLimiter: (_req, _res, next) => {
        logoutLimiterCalled = true
        next()
      },
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
    .post('/api/v1/auth/logout')
    .send({ refreshToken: 'token-1' })

  assert.equal(response.status, 200)
  assert.equal(logoutLimiterCalled, true)
  assert.deepEqual(response.body, { message: 'Logged out successfully' })
})

test('POST /api/v1/auth/forgot-password runs the dedicated forgot-password limiter before the controller', async () => {
  let forgotPasswordLimiterCalled = false

  const authRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'auth.routes.js'), {
    '../controllers/auth.controller': {
      register: async (_req, res) => res.status(501).json({ message: 'unused' }),
      submitStudentIntake: async (_req, res) => res.status(501).json({ message: 'unused' }),
      login: async (_req, res) => res.status(501).json({ message: 'unused' }),
      refresh: async (_req, res) => res.status(501).json({ message: 'unused' }),
      refreshMobile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      verifyEmail: async (_req, res) => res.status(501).json({ message: 'unused' }),
      resendVerification: async (_req, res) => res.status(501).json({ message: 'unused' }),
      logout: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMe: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getStudentIdQr: async (_req, res) => res.status(501).json({ message: 'unused' }),
      updateProfile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      uploadAvatar: async (_req, res) => res.status(501).json({ message: 'unused' }),
      changePassword: async (_req, res) => res.status(501).json({ message: 'unused' }),
      completeProfile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      forgotPassword: async (_req, res) => res.status(200).json({ message: 'ok' }),
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
      forgotPasswordLimiter: (_req, _res, next) => {
        forgotPasswordLimiterCalled = true
        next()
      },
      resendVerificationLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => next(),
      refreshLimiter: (_req, _res, next) => next(),
      logoutLimiter: (_req, _res, next) => next(),
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
    .post('/api/v1/auth/forgot-password')
    .send({ email: 'student@example.com' })

  assert.equal(response.status, 200)
  assert.equal(forgotPasswordLimiterCalled, true)
  assert.deepEqual(response.body, { message: 'ok' })
})

test('PATCH /api/v1/auth/complete-profile rejects invalid dateOfBirth values before the controller runs', async () => {
  let controllerCalled = false

  const authRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'auth.routes.js'), {
    '../controllers/auth.controller': {
      register: async (_req, res) => res.status(501).json({ message: 'unused' }),
      submitStudentIntake: async (_req, res) => res.status(501).json({ message: 'unused' }),
      login: async (_req, res) => res.status(501).json({ message: 'unused' }),
      refresh: async (_req, res) => res.status(501).json({ message: 'unused' }),
      refreshMobile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      verifyEmail: async (_req, res) => res.status(501).json({ message: 'unused' }),
      resendVerification: async (_req, res) => res.status(501).json({ message: 'unused' }),
      logout: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMe: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getStudentIdQr: async (_req, res) => res.status(501).json({ message: 'unused' }),
      updateProfile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      uploadAvatar: async (_req, res) => res.status(501).json({ message: 'unused' }),
      changePassword: async (_req, res) => res.status(501).json({ message: 'unused' }),
      completeProfile: async (_req, res) => {
        controllerCalled = true
        res.status(200).json({ message: 'unused' })
      },
      forgotPassword: async (_req, res) => res.status(501).json({ message: 'unused' }),
      resetPassword: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getActivity: async (_req, res) => res.status(501).json({ message: 'unused' }),
      logoutAll: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../middleware/auth.middleware': {
      protect: (req, _res, next) => {
        req.user = { id: 'student-1', role: 'STUDENT' }
        next()
      },
      allowRoles: () => (_req, _res, next) => next()
    },
    '../middleware/rateLimit.middleware': {
      authLimiter: (_req, _res, next) => next(),
      forgotPasswordLimiter: (_req, _res, next) => next(),
      resendVerificationLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => next(),
      refreshLimiter: (_req, _res, next) => next(),
      logoutLimiter: (_req, _res, next) => next(),
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
    .patch('/api/v1/auth/complete-profile')
    .send({
      phone: '9800000000',
      fatherName: 'Father',
      motherName: 'Mother',
      fatherPhone: '9800000001',
      motherPhone: '9800000002',
      bloodGroup: 'A+',
      localGuardianName: 'Guardian',
      localGuardianAddress: 'Kathmandu',
      localGuardianPhone: '9800000003',
      permanentAddress: 'Bhaktapur',
      temporaryAddress: 'Lalitpur',
      dateOfBirth: 'not-a-date',
      section: 'A'
    })

  assert.equal(response.status, 400)
  assert.equal(controllerCalled, false)
  assert.equal(response.body.message, 'Validation failed')
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
      importStudents: async (_req, res) => res.json({}),
      getStudentImportJob: async (_req, res) => res.json({}),
      updateUser: async (_req, res) => res.json({}),
      bulkAssignStudentSection: async (_req, res) => res.json({}),
      promoteStudentSemester: async (_req, res) => res.json({}),
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
    message: 'Access denied. Only ADMIN, COORDINATOR can do this.'
  })
  assert.equal(statsCalled, false)
})

test('POST /api/v1/admin/users/coordinator denies coordinators through the real admin route', async () => {
  let createCoordinatorCalled = false

  const adminRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'admin.routes.js'), {
    '../controllers/admin.controller': {
      getAdminStats: async (_req, res) => res.json({ stats: {} }),
      getAllUsers: async (_req, res) => res.json({ users: [] }),
      getUserById: async (_req, res) => res.json({ user: null }),
      getStudentApplications: async (_req, res) => res.json({ applications: [] }),
      updateStudentApplicationStatus: async (_req, res) => res.json({}),
      createStudentFromApplication: async (_req, res) => res.json({}),
      deleteStudentApplication: async (_req, res) => res.json({}),
      createCoordinator: async (_req, res) => {
        createCoordinatorCalled = true
        res.json({})
      },
      createGatekeeper: async (_req, res) => res.json({}),
      createInstructor: async (_req, res) => res.json({}),
      createStudent: async (_req, res) => res.json({}),
      importStudents: async (_req, res) => res.json({}),
      getStudentImportJob: async (_req, res) => res.json({}),
      updateUser: async (_req, res) => res.json({}),
      bulkAssignStudentSection: async (_req, res) => res.json({}),
      promoteStudentSemester: async (_req, res) => res.json({}),
      toggleUserStatus: async (_req, res) => res.json({}),
      deleteUser: async (_req, res) => res.json({})
    },
    '../middleware/auth.middleware': {
      protect: (req, _res, next) => {
        req.user = { id: 'coordinator-user-1', role: 'COORDINATOR' }
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
    },
    '../middleware/rateLimit.middleware': {
      staffUploadLimiter: (_req, _res, next) => next()
    },
    '../middleware/upload.middleware': {
      uploadSpreadsheet: {
        single: () => (_req, _res, next) => next()
      },
      validateUploadedSpreadsheet: (_req, _res, next) => next()
    }
  })

  const testApp = express()
  testApp.use(express.json())
  testApp.use('/api/v1/admin', adminRoutes)

  const response = await request(testApp)
    .post('/api/v1/admin/users/coordinator')
    .send({
      name: 'New Coordinator',
      email: 'new-coordinator@example.com',
      password: 'Password123A'
    })

  assert.equal(response.status, 403)
  assert.equal(createCoordinatorCalled, false)
  assert.deepEqual(response.body, {
    message: 'Access denied. Only ADMIN can do this.'
  })
})

test('POST /api/v1/admin/users/gatekeeper allows coordinators through the documented route boundary', async () => {
  let createGatekeeperCalled = false

  const adminRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'admin.routes.js'), {
    '../controllers/staff.controller': {
      createCoordinator: async (_req, res) => res.status(501).json({ message: 'unused' }),
      createGatekeeper: async (_req, res) => {
        createGatekeeperCalled = true
        res.status(201).json({ user: { id: 'gatekeeper-user-1' } })
      },
      createInstructor: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../middleware/auth.middleware': {
      protect: (req, _res, next) => {
        req.user = { id: 'coordinator-user-1', role: 'COORDINATOR' }
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
    },
    '../middleware/rateLimit.middleware': {
      staffUploadLimiter: (_req, _res, next) => next()
    },
    '../middleware/upload.middleware': {
      uploadSpreadsheet: {
        single: () => (_req, _res, next) => next()
      },
      validateUploadedSpreadsheet: (_req, _res, next) => next()
    }
  })

  const testApp = express()
  testApp.use(express.json())
  testApp.use('/api/v1/admin', adminRoutes)

  const response = await request(testApp)
    .post('/api/v1/admin/users/gatekeeper')
    .send({
      name: 'Gate Keeper',
      email: 'gatekeeper@example.com',
      password: 'Password123A'
    })

  assert.equal(response.status, 201)
  assert.equal(createGatekeeperCalled, true)
  assert.deepEqual(response.body, { user: { id: 'gatekeeper-user-1' } })
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
