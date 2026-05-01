const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const path = require('node:path')
const { createRequire } = require('node:module')

const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)

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

const createResponse = () => {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    cookies: [],
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    cookie(...args) {
      this.cookies.push(args)
      return this
    },
    clearCookie(...args) {
      this.cookies.push(['clearCookie', ...args])
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
      return this
    },
    internalError(error) {
      throw error
    }
  }

  return res
}

const authControllerMocks = (overrides = {}) => ({
  '../utils/prisma': {},
  'bcryptjs': {
    compare: async () => false,
    hash: async () => 'hashed'
  },
  '../utils/enrollment': {
    enrollStudentInMatchingSubjects: async () => {}
  },
  '../utils/logger': {
    info: () => {},
    error: () => {},
    warn: () => {}
  },
  '../utils/token': {
    signAccessToken: () => 'access-token',
    signRefreshToken: () => 'refresh-token',
    verifyRefreshToken: () => ({ id: 'user-1' }),
    hashToken: () => 'hash',
    getRefreshTokenExpiry: () => new Date(),
    getRefreshCookieOptions: () => ({})
  },
  '../utils/mailer': {
    sendMail: async () => {}
  },
  '../utils/emailTemplates': {
    passwordResetTemplate: () => ({ subject: 'Reset', html: '<p>Reset</p>', text: 'Reset' })
  },
  'qrcode': {
    toDataURL: async () => 'data:image/png;base64,qr'
  },
  ...overrides
})

const createSignedStudentIdQr = (payload, secret = 'test-qr-secret') => {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex')

  return JSON.stringify({ payload, signature })
}

test('login returns generic invalid credentials when user does not exist', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'
  const compareCalls = []

  const { login } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async () => null
      }
    },
    'bcryptjs': {
      compare: async (...args) => {
        compareCalls.push(args)
        return false
      },
      hash: async () => 'hashed'
    }
  }))

  const req = {
    body: {
      email: 'missing@example.com',
      password: 'wrong-password'
    }
  }
  const res = createResponse()

  await login(req, res)

  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { message: 'Invalid credentials' })
  assert.equal(compareCalls.length, 1)
  assert.equal(compareCalls[0][0], 'wrong-password')
})

test('login applies a minimum response duration for invalid credentials', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'

  const originalSetTimeout = global.setTimeout
  const timeoutCalls = []
  global.setTimeout = (callback, delay, ...args) => {
    timeoutCalls.push(delay)
    callback(...args)
    return 0
  }

  try {
    const { login } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
      '../utils/prisma': {
        user: {
          findUnique: async () => null
        }
      }
    }))

    const req = {
      body: {
        email: 'missing@example.com',
        password: 'wrong-password'
      }
    }
    const res = createResponse()

    await login(req, res)

    assert.equal(res.statusCode, 401)
    assert.ok(timeoutCalls.some((delay) => delay > 0))
  } finally {
    global.setTimeout = originalSetTimeout
  }
})

test('login enforces captcha before evaluating password after repeated failed attempts', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'
  process.env.JWT_SECRET = 'test-jwt-secret'
  process.env.LOGIN_CAPTCHA_SECRET = 'test-login-captcha-secret'
  const updates = []

  const { login } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          email: 'student@example.com',
          password: 'hashed-password',
          role: 'STUDENT',
          isActive: true,
          failedLoginAttempts: 4,
          lockedUntil: null
        }),
        update: async (payload) => {
          updates.push(payload)
          return payload
        }
      }
    }
  }))

  const req = {
    body: {
      email: 'student@example.com',
      password: 'wrong-password'
    }
  }
  const res = createResponse()

  await login(req, res)

  assert.equal(res.statusCode, 401)
  assert.equal(res.body.requiresCaptcha, true)
  assert.equal(res.body.message, 'Please complete the security check to continue.')
  assert.equal(updates.length, 0)
})

test('login returns a captcha challenge after repeated failed attempts below lockout', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'
  process.env.JWT_SECRET = 'test-jwt-secret'
  process.env.LOGIN_CAPTCHA_SECRET = 'test-login-captcha-secret'
  const updates = []

  const { login } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          email: 'student@example.com',
          password: 'hashed-password',
          role: 'STUDENT',
          isActive: true,
          failedLoginAttempts: 2,
          lockedUntil: null
        }),
        update: async (payload) => {
          updates.push(payload)
          return payload
        }
      }
    }
  }))

  const req = {
    body: {
      email: 'student@example.com',
      password: 'wrong-password'
    }
  }
  const res = createResponse()

  await login(req, res)

  assert.equal(res.statusCode, 401)
  assert.equal(updates.length, 1)
  assert.equal(updates[0].data.failedLoginAttempts, 3)
  assert.equal(res.body.requiresCaptcha, true)
  assert.equal(typeof res.body.captchaChallenge?.prompt, 'string')
  assert.equal(typeof res.body.captchaChallenge?.token, 'string')
})

test('login requires a captcha challenge once the failure threshold is reached', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'
  process.env.JWT_SECRET = 'test-jwt-secret'
  process.env.LOGIN_CAPTCHA_SECRET = 'test-login-captcha-secret'
  const userUpdates = []
  const studentUpdates = []

  const { login } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async (...args) => {
          if (args[0]?.where?.email === 'student@example.com') {
            return {
              id: 'user-1',
              email: 'student@example.com',
              password: 'hashed-password',
              role: 'STUDENT',
              isActive: true,
              failedLoginAttempts: 3,
              lockedUntil: null,
              mustChangePassword: false,
              profileCompleted: true
            }
          }

          userUpdates.push(args[0])
          return {
            id: 'user-1',
            name: 'Student User',
            email: 'student@example.com',
            role: 'STUDENT',
            avatar: null,
            mustChangePassword: false,
            profileCompleted: true,
            student: {
              id: 'student-1',
              rollNumber: '23-001',
              semester: 3,
              section: 'A',
              department: 'BCA'
            }
          }
        },
        update: async (payload) => {
          userUpdates.push(payload)
          return payload
        }
      },
      student: {
        update: async (payload) => {
          studentUpdates.push(payload)
          return payload
        }
      }
    },
    'bcryptjs': {
      compare: async () => true,
      hash: async () => 'hashed'
    }
  }))

  const req = {
    body: {
      email: 'student@example.com',
      password: 'Password123'
    }
  }
  const res = createResponse()

  await login(req, res)

  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body.message, 'Please complete the security check to continue.')
  assert.equal(res.body.requiresCaptcha, true)
  assert.equal(studentUpdates.length, 0)
})

test('login returns captcha challenge at threshold even when password is incorrect', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'
  process.env.JWT_SECRET = 'test-jwt-secret'
  process.env.LOGIN_CAPTCHA_SECRET = 'test-login-captcha-secret'
  const updates = []

  const { login } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          email: 'student@example.com',
          password: 'hashed-password',
          role: 'STUDENT',
          isActive: true,
          failedLoginAttempts: 3,
          lockedUntil: null
        }),
        update: async (payload) => {
          updates.push(payload)
          return payload
        }
      }
    },
    'bcryptjs': {
      compare: async () => false,
      hash: async () => 'hashed'
    }
  }))

  const req = {
    body: {
      email: 'student@example.com',
      password: 'wrong-password'
    }
  }
  const res = createResponse()

  await login(req, res)

  assert.equal(res.statusCode, 401)
  assert.equal(res.body.requiresCaptcha, true)
  assert.equal(res.body.message, 'Please complete the security check to continue.')
  assert.equal(updates.length, 0)
})

test('login blocks requests while the account is locked', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'

  const { login } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          email: 'student@example.com',
          password: 'hashed-password',
          role: 'STUDENT',
          isActive: true,
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() + 60_000)
        })
      }
    }
  }))

  const req = {
    body: {
      email: 'student@example.com',
      password: 'Password123'
    }
  }
  const res = createResponse()

  await login(req, res)

  assert.equal(res.statusCode, 401)
  assert.equal(res.body.message, 'Invalid credentials')
  assert.equal(typeof res.body.retryAfter, 'number')
  assert.ok(res.body.retryAfter > 0)
})

test('forgotPassword returns the same generic response when account exists and queues reset email', async () => {
  const userUpdates = []
  const sendMailCalls = []

  const { forgotPassword } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          name: 'Student User',
          email: 'student@example.com'
        }),
        update: async (payload) => {
          userUpdates.push(payload)
          return payload
        }
      }
    },
    '../utils/mailer': {
      sendMail: (payload) => {
        sendMailCalls.push(payload)
        return Promise.resolve()
      }
    }
  }))

  const previousFlag = process.env.ENABLE_PASSWORD_RESET
  process.env.ENABLE_PASSWORD_RESET = 'true'

  try {
    const req = {
      body: { email: 'Student@Example.com' }
    }
    const res = createResponse()

    await forgotPassword(req, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, {
      message: 'If an account with that email exists, a reset link has been sent.'
    })
    assert.equal(userUpdates.length, 1)
    assert.equal(sendMailCalls.length, 1)
  } finally {
    if (previousFlag === undefined) {
      delete process.env.ENABLE_PASSWORD_RESET
    } else {
      process.env.ENABLE_PASSWORD_RESET = previousFlag
    }
  }
})

test('forgotPassword returns the same generic response when account does not exist', async () => {
  const userUpdates = []
  const sendMailCalls = []

  const { forgotPassword } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async () => null,
        update: async (payload) => {
          userUpdates.push(payload)
          return payload
        }
      }
    },
    '../utils/mailer': {
      sendMail: (payload) => {
        sendMailCalls.push(payload)
        return Promise.resolve()
      }
    }
  }))

  const previousFlag = process.env.ENABLE_PASSWORD_RESET
  process.env.ENABLE_PASSWORD_RESET = 'true'

  try {
    const req = {
      body: { email: 'missing@example.com' }
    }
    const res = createResponse()

    await forgotPassword(req, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, {
      message: 'If an account with that email exists, a reset link has been sent.'
    })
    assert.equal(userUpdates.length, 0)
    assert.equal(sendMailCalls.length, 0)
  } finally {
    if (previousFlag === undefined) {
      delete process.env.ENABLE_PASSWORD_RESET
    } else {
      process.env.ENABLE_PASSWORD_RESET = previousFlag
    }
  }
})

test('verifyEmail marks the user verified and keeps the token idempotent until expiry', async () => {
  const userUpdates = []
  const { verifyEmail } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findFirst: async (payload) => {
          assert.equal(payload.where.emailVerificationToken, 'hashed-token')
          return {
            id: 'user-1',
            emailVerified: false,
            emailVerificationExpiry: new Date(Date.now() + 60_000)
          }
        },
        update: async (payload) => {
          userUpdates.push(payload)
          return {}
        }
      }
    },
    '../utils/emailVerification': {
      createEmailVerificationToken: () => ({
        token: 'raw-token',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 86_400_000)
      }),
      hashEmailVerificationToken: () => 'hashed-token',
      sendEmailVerificationEmail: async () => true
    }
  }))

  const req = { params: { token: 'raw-token' } }
  const res = createResponse()

  await verifyEmail(req, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { message: 'Email verified successfully' })
  assert.deepEqual(userUpdates[0].data, {
    emailVerified: true
  })
})

test('verifyEmail returns success for an already verified user with a valid token', async () => {
  const userUpdates = []
  const { verifyEmail } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findFirst: async () => ({
          id: 'user-1',
          emailVerified: true,
          emailVerificationExpiry: new Date(Date.now() + 60_000)
        }),
        update: async (payload) => {
          userUpdates.push(payload)
          return {}
        }
      }
    },
    '../utils/emailVerification': {
      hashEmailVerificationToken: () => 'hashed-token'
    }
  }))

  const req = { params: { token: 'raw-token' } }
  const res = createResponse()

  await verifyEmail(req, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { message: 'Email verified successfully' })
  assert.equal(userUpdates.length, 0)
})

test('resendVerification regenerates the token and sends a verification email', async () => {
  const userUpdates = []
  const sentEmails = []
  const expiresAt = new Date(Date.now() + 86_400_000)
  const { resendVerification } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async (payload) => {
          assert.equal(payload.where.email, 'student@example.com')
          return {
            id: 'user-1',
            name: 'Student One',
            email: 'student@example.com',
            emailVerified: false,
            deletedAt: null
          }
        },
        update: async (payload) => {
          userUpdates.push(payload)
          return {}
        }
      }
    },
    '../utils/emailVerification': {
      createEmailVerificationToken: () => ({
        token: 'new-token',
        tokenHash: 'new-token-hash',
        expiresAt
      }),
      hashEmailVerificationToken: () => 'unused',
      sendEmailVerificationEmail: async (payload) => {
        sentEmails.push(payload)
        return true
      }
    }
  }))

  const req = { body: { email: 'Student@Example.com' } }
  const res = createResponse()

  await resendVerification(req, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { message: 'If this email needs verification, a new link has been sent.' })
  assert.deepEqual(userUpdates[0].data, {
    emailVerificationToken: 'new-token-hash',
    emailVerificationExpiry: expiresAt
  })
  assert.deepEqual(sentEmails[0], {
    email: 'student@example.com',
    name: 'Student One',
    token: 'new-token',
    userId: 'user-1'
  })
})

test('resetPassword revokes existing refresh tokens inside the password reset transaction', async () => {
  const transactionCalls = []

  const { resetPassword } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/security': {
      hashPassword: async () => 'hashed-new-password',
      getRequiredSecret: () => 'test-secret'
    },
    '../utils/prisma': {
      user: {
        findFirst: async () => ({
          id: 'user-1',
          email: 'student@example.com'
        })
      },
      $transaction: async (callback) => callback({
        user: {
          update: async (payload) => {
            transactionCalls.push({ type: 'user.update', payload })
            return payload
          }
        },
        refreshToken: {
          updateMany: async (payload) => {
            transactionCalls.push({ type: 'refreshToken.updateMany', payload })
            return { count: 2 }
          }
        }
      })
    }
  }))

  const previousFlag = process.env.ENABLE_PASSWORD_RESET
  process.env.ENABLE_PASSWORD_RESET = 'true'

  try {
    const req = {
      body: {
        token: 'valid-reset-token',
        password: 'Password123'
      }
    }
    const res = createResponse()

    await resetPassword(req, res)

    assert.equal(res.statusCode, 200)
    assert.equal(transactionCalls.length, 2)
    assert.equal(transactionCalls[0].type, 'user.update')
    assert.equal(transactionCalls[1].type, 'refreshToken.updateMany')
    assert.equal(transactionCalls[1].payload.where.userId, 'user-1')
    assert.ok(transactionCalls[1].payload.data.revokedAt instanceof Date)
    assert.ok(transactionCalls[0].payload.data.passwordChangedAt instanceof Date)
  } finally {
    if (previousFlag === undefined) {
      delete process.env.ENABLE_PASSWORD_RESET
    } else {
      process.env.ENABLE_PASSWORD_RESET = previousFlag
    }
  }
})

test('changePassword rejects using the same current password', async () => {
  const userUpdates = []

  const { changePassword } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          password: 'hashed-password',
          role: 'STUDENT',
          email: 'student@example.com',
          name: 'Student User',
          mustChangePassword: true
        }),
        update: async (payload) => {
          userUpdates.push(payload)
          return payload
        }
      }
    },
    'bcryptjs': {
      compare: async (submittedValue) => submittedValue === 'Password123',
      hash: async () => 'hashed'
    }
  }))

  const req = {
    user: {
      id: 'user-1',
      role: 'STUDENT'
    },
    body: {
      currentPassword: 'Password123',
      newPassword: 'Password123'
    }
  }
  const res = createResponse()

  await changePassword(req, res)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, {
    message: 'New password must be different from your current password'
  })
  assert.equal(userUpdates.length, 0)
})

test('changePassword updates passwordChangedAt when password is changed', async () => {
  const userUpdates = []

  const { changePassword } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/security': {
      hashPassword: async () => 'hashed-new-password',
      getRequiredSecret: () => 'test-secret'
    },
    '../utils/prisma': {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          password: 'hashed-password',
          role: 'STUDENT',
          email: 'student@example.com',
          name: 'Student User',
          mustChangePassword: true
        }),
        update: async (payload) => {
          userUpdates.push(payload)
          return {
            id: 'user-1',
            role: 'STUDENT',
            email: 'student@example.com',
            name: 'Student User',
            mustChangePassword: false
          }
        }
      }
    },
    'bcryptjs': {
      compare: async (submittedValue) => submittedValue === 'CurrentPass123',
      hash: async () => 'hashed'
    }
  }))

  const req = {
    user: {
      id: 'user-1',
      role: 'STUDENT'
    },
    body: {
      currentPassword: 'CurrentPass123',
      newPassword: 'NewPass123'
    }
  }
  const res = createResponse()

  await changePassword(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(userUpdates.length, 1)
  assert.equal(userUpdates[0].data.password, 'hashed-new-password')
  assert.ok(userUpdates[0].data.passwordChangedAt instanceof Date)
})

test('register blocks self-registration when OPEN_REGISTRATION is disabled', async () => {
  const previousOpenRegistration = process.env.OPEN_REGISTRATION
  process.env.OPEN_REGISTRATION = 'false'

  try {
    const { register } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks())

    const req = {
      body: {
        name: 'Student User',
        email: 'student@example.com',
        password: 'Password123'
      }
    }
    const res = createResponse()

    await register(req, res)

    assert.equal(res.statusCode, 403)
    assert.deepEqual(res.body, {
      message: 'Self-registration is disabled. Please apply through the student intake form.'
    })
  } finally {
    if (previousOpenRegistration === undefined) {
      delete process.env.OPEN_REGISTRATION
    } else {
      process.env.OPEN_REGISTRATION = previousOpenRegistration
    }
  }
})

test('register blocks self-registration even when OPEN_REGISTRATION is enabled', async () => {
  const previousOpenRegistration = process.env.OPEN_REGISTRATION
  process.env.OPEN_REGISTRATION = 'true'

  try {
    const { register } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks())

    const req = {
      body: {
        name: 'Student User',
        email: 'student@example.com',
        password: 'Password123'
      }
    }
    const res = createResponse()

    await register(req, res)

    assert.equal(res.statusCode, 403)
    assert.deepEqual(res.body, {
      message: 'Self-registration is disabled. Please apply through the student intake form.'
    })
  } finally {
    if (previousOpenRegistration === undefined) {
      delete process.env.OPEN_REGISTRATION
    } else {
      process.env.OPEN_REGISTRATION = previousOpenRegistration
    }
  }
})

test('auth dateOfBirth schemas parse strict YYYY-MM-DD values into Date objects', () => {
  const { schemas } = require(resolveFromTest('src', 'validators', 'schemas.js'))

  const completeProfileBody = schemas.auth.completeProfile.body.parse({
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
    dateOfBirth: '2005-01-01',
    section: 'A'
  })

  assert.ok(completeProfileBody.dateOfBirth instanceof Date)
  assert.equal(completeProfileBody.dateOfBirth.toISOString(), '2005-01-01T00:00:00.000Z')

  const reparsedIntakeBody = schemas.auth.studentIntake.body.parse({
    fullName: 'Student User',
    email: 'student@example.com',
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
    dateOfBirth: completeProfileBody.dateOfBirth,
    preferredDepartment: 'BCA'
  })

  assert.ok(reparsedIntakeBody.dateOfBirth instanceof Date)
  assert.equal(reparsedIntakeBody.dateOfBirth.toISOString(), '2005-01-01T00:00:00.000Z')
})

test('auth dateOfBirth schemas reject invalid and out-of-range values', () => {
  const { schemas } = require(resolveFromTest('src', 'validators', 'schemas.js'))

  assert.throws(() => schemas.auth.updateProfile.body.parse({
    dateOfBirth: 'not-a-date'
  }))

  assert.throws(() => schemas.auth.studentIntake.body.parse({
    fullName: 'Student User',
    email: 'student@example.com',
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
    dateOfBirth: '1919-12-31',
    preferredDepartment: 'BCA'
  }))
})

test('auth changePassword schema rejects known weak passwords even when format rules pass', () => {
  const { schemas } = require(resolveFromTest('src', 'validators', 'schemas.js'))

  assert.throws(() => schemas.auth.changePassword.body.parse({
    currentPassword: 'CurrentPass123',
    newPassword: 'Student123'
  }))
})

test('completeProfile enforces required fields server-side before updating profileCompleted', async () => {
  const userUpdates = []
  const studentUpdates = []

  const { completeProfile } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      student: {
        findUnique: async () => ({
          id: 'student-1',
          userId: 'user-1'
        }),
        update: async (payload) => {
          studentUpdates.push(payload)
          return payload
        }
      },
      user: {
        update: async (payload) => {
          userUpdates.push(payload)
          return payload
        }
      },
      $transaction: async (operations) => Promise.all(operations)
    }
  }))

  const req = {
    user: {
      id: 'user-1',
      role: 'STUDENT'
    },
    body: {
      phone: '9800000000',
      fatherName: ' ',
      motherName: 'Mother',
      fatherPhone: '9800000001',
      motherPhone: '9800000002',
      bloodGroup: 'A+',
      localGuardianName: 'Guardian',
      localGuardianAddress: 'Kathmandu',
      localGuardianPhone: '9800000003',
      permanentAddress: 'Bhaktapur',
      temporaryAddress: 'Lalitpur',
      dateOfBirth: '2005-01-01',
      section: 'A'
    }
  }
  const res = createResponse()

  await completeProfile(req, res)

  assert.equal(res.statusCode, 400)
  assert.equal(res.body.message, 'Validation failed')
  assert.equal(userUpdates.length, 0)
  assert.equal(studentUpdates.length, 0)
})

test('material fileUrl schema allows public https URLs and rejects unsafe URLs', () => {
  const { schemas } = require(resolveFromTest('src', 'validators', 'schemas.js'))

  const parsed = schemas.materials.create.body.parse({
    title: 'Week 1 Notes',
    description: 'Introduction handout',
    fileUrl: 'https://cdn.example.com/materials/week-1.pdf',
    subjectId: '550e8400-e29b-41d4-a716-446655440000'
  })

  assert.equal(parsed.fileUrl, 'https://cdn.example.com/materials/week-1.pdf')

  assert.throws(() => schemas.materials.create.body.parse({
    title: 'Week 1 Notes',
    description: 'Introduction handout',
    fileUrl: 'javascript:alert(1)',
    subjectId: '550e8400-e29b-41d4-a716-446655440000'
  }))

  assert.throws(() => schemas.materials.create.body.parse({
    title: 'Week 1 Notes',
    description: 'Introduction handout',
    fileUrl: 'http://169.254.169.254/latest/meta-data/',
    subjectId: '550e8400-e29b-41d4-a716-446655440000'
  }))

  assert.throws(() => schemas.materials.create.body.parse({
    title: 'Week 1 Notes',
    description: 'Introduction handout',
    fileUrl: 'https://192.168.1.10/private.pdf',
    subjectId: '550e8400-e29b-41d4-a716-446655440000'
  }))
})

test('submitStudentIntake returns a generic response when a matching user already exists', async () => {
  const originalNow = Date.now
  const originalSetTimeout = global.setTimeout
  const timeoutDelays = []

  Date.now = (() => {
    const values = [1000, 1000]
    return () => values.shift() ?? 1000
  })()
  global.setTimeout = (callback, delay, ...args) => {
    timeoutDelays.push(delay)
    callback(...args)
    return 0
  }

  const { submitStudentIntake } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      studentApplication: {
        findUnique: async () => null
      },
      user: {
        findUnique: async () => ({
          id: 'user-1',
          email: 'student@example.com'
        })
      }
    },
    '../utils/security': {
      hashPassword: async () => 'hashed-password',
      getRequiredSecret: () => 'test-secret'
    }
  }))

  const req = {
    body: {
      fullName: 'Student User',
      email: 'student@example.com',
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
      dateOfBirth: '2005-01-01',
      preferredDepartment: 'BCA'
    }
  }
  const res = createResponse()

  try {
    await submitStudentIntake(req, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, {
      message: 'If this email is eligible, you will receive further instructions.'
    })
    assert.deepEqual(timeoutDelays, [75])
  } finally {
    Date.now = originalNow
    global.setTimeout = originalSetTimeout
  }
})

test('submitStudentIntake creates an application when the matching user is soft deleted', async () => {
  const upsertCalls = []
  const { submitStudentIntake } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      studentApplication: {
        findUnique: async () => null,
        upsert: async (payload) => {
          upsertCalls.push(payload)
          return payload
        }
      },
      user: {
        findUnique: async () => ({
          deletedAt: new Date()
        })
      }
    }
  }))

  const req = {
    body: {
      fullName: 'Student User',
      email: 'student@example.com',
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
      dateOfBirth: '2005-01-01',
      preferredDepartment: 'BCA'
    }
  }
  const res = createResponse()

  await submitStudentIntake(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].create.email, 'student@example.com')
  assert.equal(upsertCalls[0].create.preferredDepartment, 'BCA')
})

test('logout does not run token revocation when no refresh token is provided', async () => {
  const updateManyCalls = []
  const { logout } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      refreshToken: {
        updateMany: async (payload) => {
          updateManyCalls.push(payload)
          return { count: 0 }
        }
      }
    },
    '../utils/token': {
      signAccessToken: () => 'access-token',
      signRefreshToken: () => 'refresh-token',
      verifyRefreshToken: () => ({ id: 'user-1' }),
      hashToken: (value) => `hash:${value}`,
      getRefreshTokenExpiry: () => new Date(),
      getRefreshCookieOptions: () => ({})
    }
  }))

  const req = {
    body: {},
    cookies: {},
    ip: '127.0.0.1'
  }
  const res = createResponse()

  await logout(req, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { message: 'Logged out successfully' })
  assert.equal(updateManyCalls.length, 0)
})

test('login hides suspension reasons from the response', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'
  const warnCalls = []

  const { login } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          email: 'student@example.com',
          password: 'hashed-password',
          role: 'STUDENT',
          isActive: false,
          suspensionReason: 'Under investigation for plagiarism in BIT234',
          failedLoginAttempts: 0,
          lockedUntil: null
        })
      }
    },
    'bcryptjs': {
      compare: async () => true,
      hash: async () => 'hashed'
    },
    '../utils/logger': {
      info: () => {},
      error: () => {},
      warn: (...args) => {
        warnCalls.push(args)
      }
    },
    '../utils/security': {
      hashPassword: async () => 'hashed-password',
      getRequiredSecret: () => 'test-secret'
    }
  }))

  const req = {
    body: {
      email: 'student@example.com',
      password: 'Password123'
    }
  }
  const res = createResponse()

  await login(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'Your account has been disabled. Please contact the administration.'
  })
  assert.equal(warnCalls.length, 1)
  assert.equal(warnCalls[0][0], 'Suspended user login blocked')
  assert.deepEqual(warnCalls[0][1], {
    userId: 'user-1',
    email: 'student@example.com'
  })
})

test('updateProfile blocks students from changing their own section', async () => {
  const userUpdates = []
  const studentUpdates = []

  const { updateProfile } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        update: async (payload) => {
          userUpdates.push(payload)
          return { id: 'user-1' }
        },
        findUnique: async () => ({
          id: 'user-1',
          name: 'Student User',
          email: 'student@example.com',
          role: 'STUDENT',
          phone: '9800000000',
          address: 'Kathmandu',
          avatar: null,
          createdAt: new Date('2026-04-14T00:00:00.000Z'),
          mustChangePassword: false,
          profileCompleted: true,
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
      },
      student: {
        update: async (payload) => {
          studentUpdates.push(payload)
          return { id: 'student-1' }
        }
      }
    }
  }))

  const req = {
    user: { id: 'user-1', role: 'STUDENT' },
    body: {
      phone: '9800000000',
      section: 'B'
    }
  }
  const res = createResponse()

  await updateProfile(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'Students cannot update their section through profile settings'
  })
  assert.equal(userUpdates.length, 0)
  assert.equal(studentUpdates.length, 0)
})

test('updateProfile ignores section updates for non-student roles', async () => {
  const userUpdates = []
  const studentUpdates = []

  const { updateProfile } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        update: async (payload) => {
          userUpdates.push(payload)
          return { id: 'user-1' }
        },
        findUnique: async () => ({
          id: 'user-1',
          name: 'Instructor User',
          email: 'instructor@example.com',
          role: 'INSTRUCTOR',
          phone: '9800000000',
          address: 'Kathmandu',
          avatar: null,
          createdAt: new Date('2026-04-14T00:00:00.000Z'),
          mustChangePassword: false,
          profileCompleted: true,
          student: null,
          instructor: {
            id: 'instructor-1',
            department: 'BCA',
            departments: ['BCA']
          },
          coordinator: null
        })
      },
      student: {
        update: async (payload) => {
          studentUpdates.push(payload)
          return { id: 'student-1' }
        }
      }
    }
  }))

  const req = {
    user: { id: 'user-1', role: 'INSTRUCTOR' },
    body: {
      phone: '9800000000',
      section: 'B'
    }
  }
  const res = createResponse()

  await updateProfile(req, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.message, 'Profile updated successfully!')
  assert.equal(userUpdates.length, 1)
  assert.equal(studentUpdates.length, 0)
})

test('updateProfile maps temporaryAddress as canonical address when both address and temporaryAddress are provided', async () => {
  const userUpdates = []
  const studentUpdates = []

  const { updateProfile } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        update: async (payload) => {
          userUpdates.push(payload)
          return { id: 'user-1' }
        },
        findUnique: async () => ({
          id: 'user-1',
          name: 'Student User',
          email: 'student@example.com',
          role: 'STUDENT',
          phone: '9800000000',
          address: 'Old Address',
          avatar: null,
          createdAt: new Date('2026-04-14T00:00:00.000Z'),
          mustChangePassword: false,
          profileCompleted: true,
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
      },
      student: {
        update: async (payload) => {
          studentUpdates.push(payload)
          return { id: 'student-1' }
        }
      }
    }
  }))

  const req = {
    user: { id: 'user-1', role: 'STUDENT' },
    body: {
      phone: '9800000000',
      address: 'Permanent Address',
      temporaryAddress: 'Temporary Address'
    }
  }
  const res = createResponse()

  await updateProfile(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(userUpdates.length, 1)
  assert.equal(studentUpdates.length, 1)
  assert.equal(userUpdates[0].data.address, 'Temporary Address')
  assert.equal(studentUpdates[0].data.temporaryAddress, 'Temporary Address')
})

test('refresh revokes all active sessions when a rotated refresh token is replayed', async () => {
  const updateManyCalls = []
  const warnCalls = []
  const auditCalls = []

  const { refresh } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      refreshToken: {
        findUnique: async () => ({
          id: 'session-1',
          userId: 'user-1',
          revokedAt: new Date('2026-04-14T09:00:00.000Z'),
          expiresAt: new Date('2026-04-20T09:00:00.000Z'),
          user: {
            id: 'user-1',
            role: 'STUDENT',
            isActive: true
          }
        }),
        updateMany: async (payload) => {
          updateManyCalls.push(payload)
          return { count: 2 }
        }
      }
    },
    '../utils/logger': {
      info: () => {},
      error: () => {},
      warn: (...args) => {
        warnCalls.push(args)
      }
    },
    '../utils/audit': {
      recordAuditLog: async (payload) => {
        auditCalls.push(payload)
      }
    },
    '../utils/token': {
      signAccessToken: () => 'access-token',
      signRefreshToken: () => 'new-refresh-token',
      verifyRefreshToken: () => ({ id: 'user-1', role: 'STUDENT' }),
      hashToken: () => 'replayed-hash',
      getRefreshTokenExpiry: () => new Date(),
      getRefreshCookieOptions: () => ({ path: '/api/v1/auth', httpOnly: true })
    }
  }))

  const req = {
    cookies: {
      refreshToken: 'stolen-refresh-token'
    },
    ip: '203.0.113.10',
    get: (name) => name === 'user-agent' ? 'Replay Bot' : undefined
  }
  const res = createResponse()

  await refresh(req, res)

  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { message: 'Refresh token is invalid or expired' })
  assert.equal(updateManyCalls.length, 1)
  assert.deepEqual(updateManyCalls[0].where, {
    userId: 'user-1',
    revokedAt: null
  })
  assert.equal(warnCalls.length, 1)
  assert.equal(warnCalls[0][0], 'Refresh token reuse detected; revoked all active sessions')
  assert.deepEqual(warnCalls[0][1], {
    userId: 'user-1',
    sessionId: 'session-1',
    ipAddress: '203.0.113.10',
    userAgent: 'Replay Bot'
  })
  assert.equal(auditCalls.length, 1)
  assert.equal(auditCalls[0].action, 'AUTH_REFRESH_TOKEN_REUSE_DETECTED')
  assert.equal(res.cookies[0][0], 'clearCookie')
  assert.equal(res.cookies[0][1], 'refreshToken')
})

test('refresh rejects mobile-marked requests on the web cookie endpoint', async () => {
  let verifyCalled = false
  const { refresh } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/token': {
      signAccessToken: () => 'access-token',
      signRefreshToken: () => 'new-refresh-token',
      verifyRefreshToken: () => {
        verifyCalled = true
        return { id: 'user-1', role: 'STUDENT' }
      },
      hashToken: () => 'hash',
      getRefreshTokenExpiry: () => new Date(),
      getRefreshCookieOptions: () => ({ path: '/api/v1/auth', httpOnly: true })
    }
  }))

  const req = {
    cookies: {
      refreshToken: 'web-refresh-token'
    },
    get: (name) => name.toLowerCase() === 'x-client-type' ? 'mobile' : undefined
  }
  const res = createResponse()

  await refresh(req, res)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Use /auth/refresh/mobile for mobile clients.' })
  assert.equal(verifyCalled, false)
})

test('refreshMobile rotates only the body refresh token and does not set a cookie', async () => {
  const findUniqueCalls = []
  const updateManyCalls = []
  const createCalls = []

  const { refreshMobile } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      refreshToken: {
        findUnique: async (payload) => {
          findUniqueCalls.push(payload)
          return {
            id: 'session-1',
            userId: 'user-1',
            revokedAt: null,
            expiresAt: new Date('2026-05-02T09:00:00.000Z'),
            user: {
              id: 'user-1',
              name: 'Student One',
              email: 'student@example.com',
              role: 'STUDENT',
              isActive: true,
              mustChangePassword: false,
              profileCompleted: true
            }
          }
        }
      },
      $transaction: async (callback) => callback({
        refreshToken: {
          updateMany: async (payload) => {
            updateManyCalls.push(payload)
            return { count: 1 }
          },
          create: async (payload) => {
            createCalls.push(payload)
            return { id: 'session-2' }
          }
        }
      })
    },
    '../utils/token': {
      signAccessToken: () => 'new-access-token',
      signRefreshToken: () => 'new-refresh-token',
      verifyRefreshToken: (token) => {
        assert.equal(token, 'body-refresh-token')
        return { id: 'user-1', role: 'STUDENT' }
      },
      hashToken: (token) => `hash:${token}`,
      getRefreshTokenExpiry: () => new Date('2026-05-31T09:00:00.000Z'),
      getRefreshCookieOptions: () => ({ path: '/api/v1/auth', httpOnly: true })
    }
  }))

  const req = {
    body: {
      refreshToken: 'body-refresh-token'
    },
    cookies: {
      refreshToken: 'cookie-refresh-token'
    },
    ip: '203.0.113.10',
    get: (name) => name === 'user-agent' ? 'Mobile App' : undefined
  }
  const res = createResponse()

  await refreshMobile(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.accessToken, 'new-access-token')
  assert.equal(res.body.refreshToken, 'new-refresh-token')
  assert.equal(findUniqueCalls[0].where.tokenHash, 'hash:body-refresh-token')
  assert.equal(updateManyCalls[0].where.tokenHash, 'hash:body-refresh-token')
  assert.equal(createCalls[0].data.tokenHash, 'hash:new-refresh-token')
  assert.deepEqual(res.cookies, [])
})

test('allowRoles blocks unauthorized roles with 403', async () => {
  const { allowRoles } = loadWithMocks(resolveFromTest('src', 'middleware', 'auth.middleware.js'), {
    '../utils/prisma': {
      user: {
        findUnique: async () => null
      }
    },
    '../utils/logger': {
      error: () => {}
    }
  })

  const middleware = allowRoles('ADMIN', 'COORDINATOR')
  const req = { user: { role: 'STUDENT' } }
  const res = createResponse()
  let nextCalled = false

  middleware(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'Access denied. Only ADMIN, COORDINATOR can do this.'
  })
})

test('getAdminStats returns fresh server-side aggregate counts', async () => {
  let userCountCalls = 0
  let subjectCountCalls = 0
  const countWheres = []
  const { getAdminStats } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      user: {
        count: async ({ where } = {}) => {
          userCountCalls += 1
          countWheres.push(where || null)
          if (!where || (where.deletedAt === null && !where.role)) return 42
          if (where.role === 'STUDENT') return 30
          if (where.role === 'INSTRUCTOR') return 7
          if (where.role === 'COORDINATOR') return 3
          if (where.role === 'GATEKEEPER') return 2
          return 0
        }
      },
      subject: {
        count: async () => {
          subjectCountCalls += 1
          return 18
        }
      }
    },
    'bcryptjs': {
      hash: async () => 'hashed'
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {},
      syncStudentEnrollmentForSemester: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const firstRes = createResponse()
  await getAdminStats({}, firstRes)

  const secondRes = createResponse()
  await getAdminStats({}, secondRes)

  assert.equal(firstRes.statusCode, 200)
  assert.deepEqual(firstRes.body, {
    stats: {
      totalUsers: 42,
      totalStudents: 30,
      totalInstructors: 7,
      totalCoordinators: 3,
      totalGatekeepers: 2,
      totalSubjects: 18
    }
  })
  assert.deepEqual(secondRes.body, firstRes.body)
  assert.equal(userCountCalls, 5)
  assert.equal(subjectCountCalls, 1)
  assert.deepEqual(countWheres[0], { deletedAt: null })
  assert.deepEqual(countWheres[1], { role: 'STUDENT', deletedAt: null })
})

test('getAdminStats ignores poisoned Redis cache payloads and recomputes stats', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalRedisUrl = process.env.REDIS_URL
  process.env.NODE_ENV = 'development'
  process.env.REDIS_URL = 'redis://localhost:6379'

  let userCountCalls = 0
  let subjectCountCalls = 0

  try {
    const { getAdminStats } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
      '../utils/prisma': {
        user: {
          count: async ({ where } = {}) => {
            userCountCalls += 1
            if (!where || (where.deletedAt === null && !where.role)) return 50
            if (where.role === 'STUDENT') return 35
            if (where.role === 'INSTRUCTOR') return 8
            if (where.role === 'COORDINATOR') return 4
            if (where.role === 'GATEKEEPER') return 3
            return 0
          }
        },
        subject: {
          count: async () => {
            subjectCountCalls += 1
            return 20
          }
        }
      },
      '../utils/redis': {
        getReadyRedisClient: async () => ({
          get: async () => JSON.stringify({
            totalUsers: 'pwned',
            totalStudents: 99999
          }),
          set: async () => {},
          del: async () => {}
        })
      },
      'bcryptjs': {
        hash: async () => 'hashed'
      },
      '../utils/enrollment': {
        enrollStudentInMatchingSubjects: async () => {},
        syncStudentEnrollmentForSemester: async () => {}
      },
      '../utils/logger': {
        error: () => {},
        warn: () => {}
      },
      './department.controller': {
        ensureDepartmentExists: async () => true
      },
      '../utils/audit': {
        recordAuditLog: async () => {}
      },
      '../utils/mailer': {
        sendMail: async () => {}
      },
      '../utils/emailTemplates': {
        welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
      }
    })

    const res = createResponse()
    await getAdminStats({}, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, {
      stats: {
        totalUsers: 50,
        totalStudents: 35,
        totalInstructors: 8,
        totalCoordinators: 4,
        totalGatekeepers: 3,
        totalSubjects: 20
      }
    })
    assert.equal(userCountCalls, 5)
    assert.equal(subjectCountCalls, 1)
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }

    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL
    } else {
      process.env.REDIS_URL = originalRedisUrl
    }
  }
})

test('updateUser does not wipe coordinator department when no department is provided', async () => {
  const coordinatorUpdates = []
  const { updateUser } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      user: {
        findFirst: async () => ({
          id: 'user-1',
          role: 'COORDINATOR'
        }),
        update: async () => ({
          id: 'user-1',
          name: 'Coordinator One'
        })
      },
      coordinator: {
        update: async (payload) => {
          coordinatorUpdates.push(payload)
          return payload
        }
      }
    },
    'bcryptjs': {
      hash: async () => 'hashed'
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {},
      syncStudentEnrollmentForSemester: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    params: { id: 'user-1' },
    body: {
      name: 'Coordinator One',
      phone: '9800000000',
      address: 'Kathmandu'
    },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const res = createResponse()

  await updateUser(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(coordinatorUpdates.length, 0)
})

test('updateUser does not wipe student department when no department is provided', async () => {
  const studentUpdates = []
  const { updateUser } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      user: {
        findFirst: async () => ({
          id: 'user-1',
          role: 'STUDENT',
          student: {
            id: 'student-1',
            semester: 3,
            section: 'A',
            department: 'BCA'
          },
          instructor: null,
          coordinator: null
        }),
        update: async () => ({
          id: 'user-1',
          name: 'Student One'
        })
      },
      student: {
        update: async (payload) => {
          studentUpdates.push(payload)
          return {
            id: 'student-1',
            semester: payload.data.semester,
            section: payload.data.section,
            department: 'BCA'
          }
        }
      }
    },
    'bcryptjs': {
      hash: async () => 'hashed'
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {},
      syncStudentEnrollmentForSemester: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    params: { id: 'user-1' },
    body: {
      name: 'Student One',
      phone: '9800000000',
      address: 'Kathmandu',
      semester: 4,
      section: 'B'
    },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const res = createResponse()

  await updateUser(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(studentUpdates.length, 1)
  assert.equal(studentUpdates[0].data.department, undefined)
  assert.equal(studentUpdates[0].data.semester, 4)
  assert.equal(studentUpdates[0].data.section, 'B')
})

test('promoteStudentSemester increments the student semester and syncs enrollments', async () => {
  const enrollmentSyncCalls = []
  const auditCalls = []
  const { promoteStudentSemester } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      user: {
        findFirst: async () => ({
          id: 'user-1',
          role: 'STUDENT',
          name: 'Student One',
          student: {
            id: 'student-1',
            semester: 3,
            department: 'BCA'
          }
        })
      },
      student: {
        update: async () => ({
          id: 'student-1',
          semester: 4,
          department: 'BCA',
          section: 'A',
          rollNumber: 'BCA-001'
        })
      }
    },
    'bcryptjs': {
      hash: async () => 'hashed'
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {},
      syncStudentEnrollmentForSemester: async (payload) => {
        enrollmentSyncCalls.push(payload)
      }
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async (payload) => {
        auditCalls.push(payload)
      }
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    params: { id: 'user-1' },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const res = createResponse()

  await promoteStudentSemester(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.student.semester, 4)
  assert.deepEqual(enrollmentSyncCalls, [{
    studentId: 'student-1',
    semester: 4,
    department: 'BCA'
  }])
  assert.equal(auditCalls.length, 1)
  assert.equal(auditCalls[0].action, 'STUDENT_SEMESTER_PROMOTED')
})

test('getAllUsers scopes coordinator queries to their department', async () => {
  const findManyCalls = []
  const { getAllUsers } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      department: {
        findFirst: async () => ({ name: 'BCA', code: 'BCA' })
      },
      user: {
        findMany: async (payload) => {
          findManyCalls.push(payload)
          return []
        },
        count: async () => 0
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 20, skip: 0 })
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    query: {},
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await getAllUsers(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(findManyCalls.length, 1)
  assert.deepEqual(findManyCalls[0].where.role, { in: ['STUDENT', 'INSTRUCTOR', 'GATEKEEPER'] })
  assert.deepEqual(findManyCalls[0].where.AND[0], {
    OR: [
      {
        role: 'STUDENT',
        student: {
          is: {
            department: {
              in: ['BCA']
            }
          }
        }
      },
      {
        role: 'INSTRUCTOR',
        instructor: {
          is: {
            OR: [
              {
                department: {
                  in: ['BCA']
                }
              },
              {
                departmentMemberships: {
                  some: {
                    department: {
                      is: {
                        name: {
                          in: ['BCA']
                        }
                      }
                    }
                  }
                }
              }
            ]
          }
        }
      },
      {
        role: 'GATEKEEPER'
      }
    ]
  })
})

test('getAllUsers coerces semester query filters to numbers for Prisma', async () => {
  const findManyCalls = []
  const { getAllUsers } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      user: {
        findMany: async (payload) => {
          findManyCalls.push(payload)
          return []
        },
        count: async () => 0
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 20, skip: 0 })
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    query: {
      role: 'STUDENT',
      semester: '5',
      graduated: 'false'
    },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const res = createResponse()

  await getAllUsers(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(findManyCalls.length, 1)
  assert.deepEqual(findManyCalls[0].where.AND[0], {
    role: 'STUDENT',
    student: {
      is: {
        semester: 5,
        isGraduated: false
      }
    }
  })
})

test('createStudentFromApplication blocks coordinators from converting another department application', async () => {
  const { createStudentFromApplication } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      department: {
        findFirst: async () => ({ name: 'BCA', code: 'BCA' })
      },
      studentApplication: {
        findUnique: async () => ({
          id: 'application-1',
          preferredDepartment: 'BBS',
          linkedUserId: null,
          status: 'PENDING'
        })
      }
    },
    'bcryptjs': {
      hash: async () => 'hashed'
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    params: { id: 'application-1' },
    body: {
      studentId: 'STU-001',
      department: 'BBS',
      semester: 1,
      section: 'A'
    },
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await createStudentFromApplication(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'You can only manage applications in your own department'
  })
})

test('createInstructor allows coordinators to create instructors in their own department', async () => {
  const createCalls = []
  const { createInstructor } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      department: {
        findFirst: async () => ({ name: 'BCA', code: 'BCA' })
      },
      user: {
        findUnique: async () => null,
        create: async (payload) => {
          createCalls.push(payload)
          return {
            id: 'user-instructor-1',
            name: payload.data.name,
            email: payload.data.email,
            role: 'INSTRUCTOR',
            instructor: { department: payload.data.instructor.create.department }
          }
        }
      }
    },
    'bcryptjs': {
      hash: async () => 'hashed'
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    body: {
      name: 'Instructor One',
      email: 'instructor1@example.com',
      password: 'Password123',
      phone: '9800000000',
      address: 'Kathmandu',
      department: 'BCA'
    },
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await createInstructor(req, res)

  assert.equal(res.statusCode, 201)
  assert.equal(createCalls.length, 1)
  assert.equal(createCalls[0].data.instructor.create.department, 'BCA')
})

test('createInstructor blocks coordinators from creating instructors outside their department', async () => {
  const { createInstructor } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      department: {
        findFirst: async ({ where }) => {
          if (where?.OR?.some((entry) => entry.name === 'BCA' || entry.code === 'BCA')) {
            return { name: 'BCA', code: 'BCA' }
          }

          if (where?.OR?.some((entry) => entry.name === 'BBS' || entry.code === 'BBS')) {
            return { name: 'BBS', code: 'BBS' }
          }

          return null
        }
      },
      user: {
        findUnique: async () => null,
        create: async () => {
          throw new Error('should not create')
        }
      }
    },
    'bcryptjs': {
      hash: async () => 'hashed'
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    body: {
      name: 'Instructor Two',
      email: 'instructor2@example.com',
      password: 'Password123',
      phone: '9800000000',
      address: 'Kathmandu',
      department: 'BBS'
    },
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await createInstructor(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'Coordinators can only create instructors in their own department'
  })
})

test('deleteUser blocks deleting the last admin account', async () => {
  const deleteCalls = []
  const { deleteUser } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      user: {
        findFirst: async () => ({
          id: 'admin-2',
          role: 'ADMIN',
          email: 'admin2@example.com'
        }),
        count: async () => 1,
        update: async (payload) => {
          deleteCalls.push(payload)
          return payload
        }
      },
      refreshToken: {
        updateMany: async () => ({ count: 0 })
      },
      $transaction: async (operations) => Promise.all(operations)
    },
    'bcryptjs': {
      hash: async () => 'hashed'
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    params: { id: 'student-2' },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const res = createResponse()

  await deleteUser(req, res)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'You cannot delete the last admin user' })
  assert.equal(deleteCalls.length, 0)
})

test('deleteUser soft deletes the user and revokes refresh tokens', async () => {
  const transactionCalls = []
  const { deleteUser } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      user: {
        findFirst: async () => ({
          id: 'student-2',
          role: 'STUDENT',
          email: 'student2@example.com'
        }),
        count: async () => 2,
        update: async (payload) => {
          transactionCalls.push({ type: 'user.update', payload })
          return payload
        }
      },
      refreshToken: {
        updateMany: async (payload) => {
          transactionCalls.push({ type: 'refreshToken.updateMany', payload })
          return { count: 1 }
        }
      },
      $transaction: async (operations) => Promise.all(operations)
    },
    'bcryptjs': {
      hash: async () => 'hashed'
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    params: { id: 'student-2' },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const res = createResponse()

  await deleteUser(req, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { message: 'User deleted successfully!' })
  assert.equal(transactionCalls.length, 2)
  assert.equal(transactionCalls[0].type, 'refreshToken.updateMany')
  assert.equal(transactionCalls[0].payload.where.userId, 'student-2')
  assert.equal(transactionCalls[1].type, 'user.update')
  assert.equal(transactionCalls[1].payload.where.id, 'student-2')
  assert.equal(transactionCalls[1].payload.data.isActive, false)
  assert.ok(transactionCalls[1].payload.data.deletedAt instanceof Date)
})

test('getMyAttendance builds subject summary with groupBy instead of loading all records', async () => {
  const { getMyAttendance } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'attendance.controller.js'), {
    './shared': {
      ATTENDANCE_STATUSES: ['PRESENT', 'ABSENT', 'LATE'],
      prisma: {
        attendance: {
          findMany: async () => ([
            {
              id: 'attendance-1',
              subjectId: 'subject-1',
              status: 'PRESENT',
              date: new Date('2026-04-04T00:00:00.000Z'),
              subject: { name: 'Database Systems', code: 'DBS101' }
            }
          ]),
          count: async () => 3,
          groupBy: async () => ([
            { subjectId: 'subject-1', status: 'PRESENT', _count: { _all: 2 } },
            { subjectId: 'subject-1', status: 'ABSENT', _count: { _all: 1 } }
          ])
        },
        subject: {
          findMany: async () => ([
            { id: 'subject-1', name: 'Database Systems', code: 'DBS101' }
          ])
        }
      },
      getDayRange: () => null,
      getMonthRange: () => null,
      getOwnedSubject: async () => ({}),
      getSubjectStudents: async () => [],
      buildAttendanceSummary: () => ({}),
      buildStatusSummary: () => ({}),
      createZonedDate: () => new Date(),
      formatDisplayDate: () => '2026-04-04',
      formatMonthLabel: () => 'April 2026',
      getCoordinatorDepartmentReportPayload: async () => ({}),
      recordAuditLog: async () => {}
    },
    '../../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 10, skip: 0 })
    },
    pdfkit: class MockPdfDocument {}
  })

  const req = {
    query: {},
    student: { id: 'student-1' }
  }
  const res = createResponse()

  await getMyAttendance(req, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.summary, [
    {
      subject: 'Database Systems',
      code: 'DBS101',
      total: 3,
      present: 2,
      absent: 1,
      late: 0,
      percentage: '66.7%'
    }
  ])
})

test('getAllNotices hides student-only notices from instructors', async () => {
  const capturedWhere = []
  const { getAllNotices } = loadWithMocks(resolveFromTest('src', 'controllers', 'notice.controller.js'), {
    '../utils/prisma': {
      notice: {
        findMany: async ({ where }) => {
          capturedWhere.push(where)
          return []
        },
        count: async () => 0
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 20, skip: 0 })
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/sanitize': {
      sanitizePlainText: (value) => value
    },
    '../utils/notifications': {
      createNotifications: async () => {}
    }
  })

  const req = {
    query: {},
    user: { role: 'INSTRUCTOR' }
  }
  const res = createResponse()

  await getAllNotices(req, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(capturedWhere[0].audience, { in: ['ALL', 'INSTRUCTORS_ONLY'] })
})

test('getAllAssignments returns paginated metadata', async () => {
  const findManyCalls = []
  const { getAllAssignments } = loadWithMocks(resolveFromTest('src', 'controllers', 'assignment.controller.js'), {
    '../utils/prisma': {
      assignment: {
        findMany: async (payload) => {
          findManyCalls.push(payload)
          return []
        },
        count: async () => 42
      }
    },
    '../utils/fileStorage': {
      buildUploadedFileUrl: () => null
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 3, limit: 15, skip: 30 })
    },
    exceljs: {
      Workbook: class MockWorkbook {}
    },
    pdfkit: class MockPdfDocument {}
  })

  const req = {
    query: {},
    user: { role: 'ADMIN' }
  }
  const res = createResponse()

  await getAllAssignments(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(findManyCalls[0].skip, 30)
  assert.equal(findManyCalls[0].take, 15)
  assert.equal(res.body.page, 3)
  assert.equal(res.body.limit, 15)
  assert.equal(res.body.total, 42)
})

test('createAssignment blocks instructors from creating assignments for subjects they do not own', async () => {
  const { createAssignment } = loadWithMocks(resolveFromTest('src', 'controllers', 'assignment.controller.js'), {
    '../utils/prisma': {
      subject: {
        findUnique: async () => ({
          id: 'subject-1',
          instructorId: 'other-instructor',
          instructor: {
            id: 'other-instructor',
            user: {
              name: 'Instructor Two',
              email: 'two@example.com'
            }
          }
        })
      },
      assignment: {
        create: async () => {
          throw new Error('assignment.create should not be called')
        }
      }
    },
    '../utils/fileStorage': {
      buildUploadedFileUrl: () => '/uploads/questions/test.pdf'
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 20, skip: 0 })
    },
    '../utils/sanitize': {
      sanitizePlainText: (value) => value
    },
    exceljs: {
      Workbook: class MockWorkbook {}
    },
    pdfkit: class MockPdfDocument {}
  })

  const req = {
    body: {
      title: 'Assignment 1',
      description: 'Solve all questions carefully.',
      subjectId: 'subject-1',
      dueDate: '2026-04-10T10:00',
      totalMarks: '100'
    },
    file: { filename: 'test.pdf' },
    user: { role: 'INSTRUCTOR' },
    instructor: { id: 'instructor-1' }
  }
  const res = createResponse()

  await createAssignment(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'You can only manage assignments for your assigned subjects'
  })
})

test('exportAssignmentGrades neutralizes formula-like cell values in XLSX output', async () => {
  const addedRows = []
  let writeCalled = false

  const { exportAssignmentGrades } = loadWithMocks(resolveFromTest('src', 'controllers', 'assignment.controller.js'), {
    '../utils/prisma': {
      assignment: {
        findUnique: async () => ({
          id: 'assignment-1',
          title: 'Final Report',
          dueDate: new Date('2026-04-14T10:00:00.000Z'),
          totalMarks: 100,
          subject: {
            name: 'Database Systems',
            code: 'DBS101'
          },
          submissions: [
            {
              student: {
                rollNumber: '=ROLL-01',
                user: {
                  name: '=HYPERLINK("http://evil","click")',
                  email: '+attacker@example.com'
                }
              },
              submittedAt: new Date('2026-04-14T09:00:00.000Z'),
              status: '@SUBMITTED',
              obtainedMarks: 95,
              feedback: '-needs review'
            }
          ]
        })
      }
    },
    '../utils/fileStorage': {
      buildUploadedFileUrl: () => null
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 20, skip: 0 })
    },
    exceljs: {
      Workbook: class MockWorkbook {
        addWorksheet() {
          return {
            columns: [],
            addRow: (row) => {
              addedRows.push(row)
            }
          }
        }

        xlsx = {
          write: async () => {
            writeCalled = true
          }
        }
      }
    },
    pdfkit: class MockPdfDocument {}
  })

  const req = {
    params: { id: 'assignment-1' },
    query: { format: 'xlsx' },
    user: { role: 'COORDINATOR' }
  }
  const res = createResponse()
  res.end = () => {}

  await exportAssignmentGrades(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(writeCalled, true)
  assert.equal(addedRows.length, 1)
  assert.equal(addedRows[0].studentName.startsWith('\''), true)
  assert.equal(addedRows[0].rollNumber.startsWith('\''), true)
  assert.equal(addedRows[0].email.startsWith('\''), true)
  assert.equal(addedRows[0].status.startsWith('\''), true)
  assert.equal(addedRows[0].feedback.startsWith('\''), true)
  assert.equal(addedRows[0].obtainedMarks, 95)
})

test('exportAttendanceBySubject neutralizes formula-like values in XLSX output', async () => {
  const addedRows = []
  let writeCalled = false

  const { exportAttendanceBySubject } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'export.controller.js'), {
    './shared': {
      getAttendanceExportPayload: async () => ({
        attendance: [
          {
            student: {
              rollNumber: '=ROLL-01',
              user: {
                name: '=HYPERLINK("http://evil","click")',
                email: '+attacker@example.com'
              }
            },
            date: new Date('2026-04-14T09:00:00.000Z'),
            status: '@PRESENT'
          }
        ],
        summary: {
          total: 1,
          present: 1,
          absent: 0,
          late: 0
        },
        subject: {
          name: '-Database Systems',
          code: 'DBS101'
        },
        dateLabel: '=2026-04-14'
      }),
      getCoordinatorDepartmentReportPayload: async () => ({ error: { status: 500, message: 'unused' } }),
      formatDisplayDate: () => '-04/14/2026'
    },
    exceljs: {
      Workbook: class MockWorkbook {
        addWorksheet() {
          return {
            columns: [],
            addRows: (rows) => {
              rows.forEach((row) => addedRows.push(row))
            },
            addRow: (row) => {
              addedRows.push(row)
            }
          }
        }

        xlsx = {
          write: async () => {
            writeCalled = true
          }
        }
      }
    }
  })

  const req = {
    params: { subjectId: 'subject-1' },
    query: { format: 'xlsx' },
    user: { role: 'COORDINATOR' }
  }
  const res = createResponse()
  res.end = () => {}

  await exportAttendanceBySubject(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(writeCalled, true)
  assert.equal(addedRows.some((row) => row.value === '\'-Database Systems (DBS101)'), true)
  assert.equal(addedRows.some((row) => row.value === '\'=2026-04-14'), true)
  assert.equal(addedRows.some((row) => row.name?.startsWith('\'')), true)
  assert.equal(addedRows.some((row) => row.rollNumber?.startsWith('\'')), true)
  assert.equal(addedRows.some((row) => row.email?.startsWith('\'')), true)
  assert.equal(addedRows.some((row) => row.status?.startsWith('\'')), true)
})

test('getAllMaterials returns paginated metadata', async () => {
  const findManyCalls = []
  const { getAllMaterials } = loadWithMocks(resolveFromTest('src', 'controllers', 'studyMaterial.controller.js'), {
    '../utils/prisma': {
      studyMaterial: {
        findMany: async (payload) => {
          findManyCalls.push(payload)
          return []
        },
        count: async () => 12
      }
    },
    '../utils/fileStorage': {
      buildUploadedFileUrl: () => null
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 2, limit: 25, skip: 25 })
    }
  })

  const req = {
    query: {},
    user: { role: 'ADMIN' }
  }
  const res = createResponse()

  await getAllMaterials(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(findManyCalls[0].skip, 25)
  assert.equal(findManyCalls[0].take, 25)
  assert.equal(res.body.page, 2)
  assert.equal(res.body.limit, 25)
  assert.equal(res.body.total, 12)
})

test('createMaterial blocks instructors from uploading materials to another instructor subject', async () => {
  const { createMaterial } = loadWithMocks(resolveFromTest('src', 'controllers', 'studyMaterial.controller.js'), {
    '../utils/prisma': {
      subject: {
        findUnique: async () => ({
          id: 'subject-1',
          instructorId: 'instructor-2'
        })
      },
      studyMaterial: {
        create: async () => {
          throw new Error('studyMaterial.create should not be called')
        }
      }
    },
    '../utils/fileStorage': {
      buildUploadedFileUrl: () => '/api/v1/uploads/material.pdf'
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 20, skip: 0 })
    },
    '../utils/sanitize': {
      sanitizePlainText: (value) => value
    }
  })

  const req = {
    body: {
      title: 'Week 1 Slides',
      description: 'Introduction notes',
      subjectId: 'subject-1'
    },
    file: { filename: 'material.pdf' },
    user: { role: 'INSTRUCTOR' },
    instructor: { id: 'instructor-1' }
  }
  const res = createResponse()

  await createMaterial(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'You can only upload materials for your assigned subjects'
  })
})

test('getAbsenceTicketsForStaff returns paginated metadata', async () => {
  const findManyCalls = []
  const { getAbsenceTicketsForStaff } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'tickets.controller.js'), {
    './shared': {
      prisma: {
        absenceTicket: {
          findMany: async (payload) => {
            findManyCalls.push(payload)
            return []
          },
          count: async () => 8
        }
      },
      hasAbsenceTicketDelegate: () => true,
      respondAttendanceTicketUnavailable: () => {}
    },
    '../../utils/notifications': {
      createNotification: async () => {}
    },
    '../../utils/pagination': {
      getPagination: () => ({ page: 4, limit: 10, skip: 30 })
    }
  })

  const req = {
    query: {},
    user: { role: 'INSTRUCTOR' },
    instructor: { id: 'instructor-1' }
  }
  const res = createResponse()

  await getAbsenceTicketsForStaff(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(findManyCalls[0].skip, 30)
  assert.equal(findManyCalls[0].take, 10)
  assert.equal(res.body.page, 4)
  assert.equal(res.body.limit, 10)
  assert.equal(res.body.total, 8)
})

test('updateStudentApplicationStatus blocks manual conversion without account creation', async () => {
  const { updateStudentApplicationStatus } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      studentApplication: {
        update: async () => {
          throw new Error('should not update')
        }
      }
    },
    'bcryptjs': {
      hash: async () => 'hashed'
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    params: { id: 'application-1' },
    body: { status: 'CONVERTED' },
    user: { id: 'admin-1' }
  }
  const res = createResponse()

  await updateStudentApplicationStatus(req, res)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, {
    message: 'Student applications can only be marked as converted when an account is created from the application.'
  })
})

test('submitStudentIntake upserts the application payload and returns success', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'

  const upsertCalls = []
  const { submitStudentIntake } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      studentApplication: {
        findUnique: async () => null,
        upsert: async (payload) => {
          upsertCalls.push(payload)
          return payload
        }
      },
      user: {
        findUnique: async () => null
      }
    }
  }))

  const req = {
    body: {
      fullName: 'Arman Dev',
      email: 'arman@example.com',
      phone: '9800000000',
      fatherName: 'Father Name',
      motherName: 'Mother Name',
      fatherPhone: '9800000001',
      motherPhone: '9800000002',
      bloodGroup: 'A+',
      localGuardianName: 'Guardian Name',
      localGuardianAddress: 'Kathmandu',
      localGuardianPhone: '9800000003',
      permanentAddress: 'Bhaktapur',
      temporaryAddress: 'Lalitpur',
      dateOfBirth: '2005-01-01',
      preferredDepartment: 'BCA'
    }
  }
  const res = createResponse()

  await submitStudentIntake(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.message, 'If this email is eligible, you will receive further instructions.')
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].where.email, 'arman@example.com')
  assert.equal(upsertCalls[0].create.preferredDepartment, 'BCA')
})

test('submitStudentIntake allows resubmission when a prior application was reviewed', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'

  const upsertCalls = []
  const { submitStudentIntake } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      studentApplication: {
        findUnique: async () => ({ id: 'application-1', status: 'REVIEWED' }),
        upsert: async (payload) => {
          upsertCalls.push(payload)
          return payload
        }
      },
      user: {
        findUnique: async () => null
      }
    }
  }))

  const req = {
    body: {
      fullName: 'Arman Dev',
      email: 'arman@example.com',
      phone: '9800000000',
      fatherName: 'Father Name',
      motherName: 'Mother Name',
      fatherPhone: '9800000001',
      motherPhone: '9800000002',
      bloodGroup: 'A+',
      localGuardianName: 'Guardian Name',
      localGuardianAddress: 'Kathmandu',
      localGuardianPhone: '9800000003',
      permanentAddress: 'Bhaktapur',
      temporaryAddress: 'Lalitpur',
      dateOfBirth: '2005-01-01',
      preferredDepartment: 'BCA'
    }
  }
  const res = createResponse()

  await submitStudentIntake(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].update.status, 'PENDING')
  assert.equal(upsertCalls[0].update.reviewedAt, null)
  assert.equal(upsertCalls[0].update.reviewedBy, null)
})

test('submitStudentIntake returns a generic response for duplicate pending applications', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'

  const { submitStudentIntake } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      studentApplication: {
        findUnique: async () => ({ id: 'application-1', status: 'PENDING' }),
        upsert: async () => {
          throw new Error('should not upsert')
        }
      },
      user: {
        findUnique: async () => null
      }
    }
  }))

  const req = {
    body: {
      fullName: 'Arman Dev',
      email: 'arman@example.com',
      phone: '9800000000',
      fatherName: 'Father Name',
      motherName: 'Mother Name',
      fatherPhone: '9800000001',
      motherPhone: '9800000002',
      bloodGroup: 'A+',
      localGuardianName: 'Guardian Name',
      localGuardianAddress: 'Kathmandu',
      localGuardianPhone: '9800000003',
      permanentAddress: 'Bhaktapur',
      temporaryAddress: 'Lalitpur',
      dateOfBirth: '2005-01-01',
      preferredDepartment: 'BCA'
    }
  }
  const res = createResponse()

  await submitStudentIntake(req, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, {
    message: 'If this email is eligible, you will receive further instructions.'
  })
})

test('toggleUserStatus returns 409 when another request already changed the status', async () => {
  const auditCalls = []
  const { toggleUserStatus } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      user: {
        findFirst: async ({ select } = {}) => {
          if (select?.student || select?.instructor || select?.coordinator) {
            return {
              id: 'user-2',
              role: 'STUDENT',
              isActive: true,
              email: 'student@example.com',
              student: { department: 'BCA' },
              instructor: null,
              coordinator: null
            }
          }

          return {
            id: 'user-2',
            isActive: false
          }
        },
        updateMany: async () => ({ count: 0 })
      }
    },
    'bcryptjs': {
      hash: async () => 'hashed'
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async (payload) => {
        auditCalls.push(payload)
      }
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    params: { id: 'user-2' },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const res = createResponse()

  await toggleUserStatus(req, res)

  assert.equal(res.statusCode, 409)
  assert.deepEqual(res.body, {
    message: 'User status changed before this request could be applied. Please refresh and try again.'
  })
  assert.equal(auditCalls.length, 0)
})

test('markAttendanceQR creates a present attendance record for eligible students', async () => {
  const createCalls = []
  const { markAttendanceQR } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'qr.controller.js'), {
    './shared': {
      QR_VALIDITY_MINUTES: 15,
      prisma: {
        subject: {
          findUnique: async () => ({ id: 'subject-1', name: 'Database Systems' })
        },
        subjectEnrollment: {
          findUnique: async () => ({ id: 'enrollment-1' })
        },
        attendance: {
          findUnique: async () => null,
          create: async (payload) => {
            createCalls.push(payload)
            return {
              id: 'attendance-1',
              status: 'PRESENT',
              date: payload.data.date,
              subject: { name: 'Database Systems', code: 'DBS101' },
              student: { user: { name: 'Arman Dev' } }
            }
          }
        }
      },
      getDayRange: () => ({
        start: new Date('2026-04-03T00:00:00.000Z'),
        end: new Date('2026-04-04T00:00:00.000Z')
      }),
      getOwnedSubject: async () => ({}),
      createSignedQrPayload: () => 'signed',
      hashQrPayload: (value) => `hashed:${value}`,
      parseQrPayload: () => ({
        subjectId: 'subject-1',
        instructorId: 'instructor-1',
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      }),
      getDailyGateWindows: async () => ({}),
      normalizeSemesterList: () => [],
      getEligibleGateAttendanceForStudent: async () => ({}),
      upsertPresentAttendanceForRoutines: async () => ({}),
      syncClosedRoutineAbsences: async () => {},
      getStudentByIdCardQr: async () => ({}),
      recordAuditLog: async () => {}
    },
    qrcode: {
      toDataURL: async () => 'data:image/png;base64,qr'
    }
  })

  const req = {
    body: { qrData: 'qr-payload' },
    user: { id: 'user-1', role: 'STUDENT' },
    student: { id: 'student-1' }
  }
  const res = createResponse()

  await markAttendanceQR(req, res)

  assert.equal(res.statusCode, 201)
  assert.match(res.body.message, /attendance marked successfully/i)
  assert.equal(createCalls.length, 1)
  assert.equal(createCalls[0].data.studentId, 'student-1')
  assert.equal(createCalls[0].data.subjectId, 'subject-1')
  assert.equal(createCalls[0].data.qrCode, 'hashed:qr-payload')
})

test('markAttendanceQR rejects replay when attendance already exists for the same student and subject', async () => {
  const createCalls = []
  const { markAttendanceQR } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'qr.controller.js'), {
    './shared': {
      QR_VALIDITY_MINUTES: 15,
      prisma: {
        subject: {
          findUnique: async () => ({ id: 'subject-1', name: 'Database Systems' })
        },
        subjectEnrollment: {
          findUnique: async () => ({ id: 'enrollment-1' })
        },
        attendance: {
          findUnique: async () => ({
            id: 'attendance-existing',
            status: 'ABSENT'
          }),
          create: async (payload) => {
            createCalls.push(payload)
            return payload
          }
        }
      },
      getDayRange: () => ({
        start: new Date('2026-04-03T00:00:00.000Z'),
        end: new Date('2026-04-04T00:00:00.000Z')
      }),
      getOwnedSubject: async () => ({}),
      createSignedQrPayload: () => 'signed',
      hashQrPayload: (value) => `hashed:${value}`,
      parseQrPayload: () => ({
        subjectId: 'subject-1',
        instructorId: 'instructor-1',
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      }),
      getDailyGateWindows: async () => ({}),
      normalizeSemesterList: () => [],
      getEligibleGateAttendanceForStudent: async () => ({}),
      upsertPresentAttendanceForRoutines: async () => ({}),
      syncClosedRoutineAbsences: async () => {},
      getStudentByIdCardQr: async () => ({}),
      recordAuditLog: async () => {}
    },
    qrcode: {
      toDataURL: async () => 'data:image/png;base64,qr'
    }
  })

  const req = {
    body: { qrData: 'qr-payload' },
    user: { id: 'user-1', role: 'STUDENT' },
    student: { id: 'student-1' }
  }
  const res = createResponse()

  await markAttendanceQR(req, res)

  assert.equal(res.statusCode, 409)
  assert.deepEqual(res.body, {
    message: 'Attendance has already been recorded for this subject today.'
  })
  assert.equal(createCalls.length, 0)
})

test('scanStudentIdAttendance requires subjectId for instructor and coordinator scans', async () => {
  let gateEligibilityCalls = 0
  let ownedSubjectCalls = 0

  const { scanStudentIdAttendance } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'qr.controller.js'), {
    './shared': {
      QR_VALIDITY_MINUTES: 15,
      prisma: {
        subjectEnrollment: { findUnique: async () => ({ id: 'enrollment-1' }) },
        attendance: { upsert: async () => ({ id: 'attendance-1' }) }
      },
      getDayRange: () => ({
        start: new Date('2026-04-03T00:00:00.000Z'),
        end: new Date('2026-04-04T00:00:00.000Z')
      }),
      getOwnedSubject: async () => {
        ownedSubjectCalls += 1
        return { subject: { id: 'subject-1', name: 'DBS', code: 'DBS101', instructorId: 'instructor-1' }, instructor: { id: 'instructor-1' } }
      },
      createSignedQrPayload: () => 'signed',
      hashQrPayload: () => 'hashed',
      parseQrPayload: () => ({}),
      getDailyGateWindows: async () => ({}),
      normalizeSemesterList: () => [],
      getEligibleGateAttendanceForStudent: async () => {
        gateEligibilityCalls += 1
        return {}
      },
      upsertPresentAttendanceForRoutines: async () => ({ markedSubjects: [] }),
      getStudentByIdCardQr: async () => ({
        student: {
          id: 'student-1',
          rollNumber: 'BCA-001',
          semester: 4,
          section: 'A',
          user: { name: 'Arman Dev' }
        }
      }),
      recordAuditLog: async () => {}
    },
    qrcode: {
      toDataURL: async () => 'data:image/png;base64,qr'
    }
  })

  const req = {
    body: { qrData: 'student-id-qr' },
    user: { id: 'instructor-user-1', role: 'INSTRUCTOR' }
  }
  const res = createResponse()

  await scanStudentIdAttendance(req, res)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'subjectId is required for instructor/coordinator scans' })
  assert.equal(gateEligibilityCalls, 0)
  assert.equal(ownedSubjectCalls, 0)
})

test('scanStudentIdAttendance allows gatekeeper scans without subjectId', async () => {
  let ownedSubjectCalls = 0
  let upsertCalls = 0

  const { scanStudentIdAttendance } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'qr.controller.js'), {
    './shared': {
      QR_VALIDITY_MINUTES: 15,
      prisma: {
        subjectEnrollment: { findUnique: async () => ({ id: 'enrollment-1' }) },
        attendance: { upsert: async () => ({ id: 'attendance-1' }) }
      },
      getDayRange: () => ({
        start: new Date('2026-04-03T00:00:00.000Z'),
        end: new Date('2026-04-04T00:00:00.000Z')
      }),
      getOwnedSubject: async () => {
        ownedSubjectCalls += 1
        return {}
      },
      createSignedQrPayload: () => 'signed',
      hashQrPayload: () => 'hashed',
      parseQrPayload: () => ({}),
      getDailyGateWindows: async () => ({}),
      normalizeSemesterList: () => [],
      getEligibleGateAttendanceForStudent: async () => ({
        routines: [{ id: 'routine-1', subjectId: 'subject-1' }],
        gateDay: {
          dayRange: {
            start: new Date('2026-04-03T00:00:00.000Z'),
            end: new Date('2026-04-04T00:00:00.000Z')
          }
        }
      }),
      upsertPresentAttendanceForRoutines: async () => {
        upsertCalls += 1
        return {
          markedSubjects: [{ subjectId: 'subject-1', status: 'PRESENT' }]
        }
      },
      getStudentByIdCardQr: async () => ({
        student: {
          id: 'student-1',
          rollNumber: 'BCA-001',
          semester: 4,
          section: 'A',
          user: { name: 'Arman Dev' }
        }
      }),
      recordAuditLog: async () => {}
    },
    qrcode: {
      toDataURL: async () => 'data:image/png;base64,qr'
    }
  })

  const req = {
    body: { qrData: 'student-id-qr' },
    user: { id: 'gatekeeper-user-1', role: 'GATEKEEPER' }
  }
  const res = createResponse()

  await scanStudentIdAttendance(req, res)

  assert.equal(res.statusCode, 201)
  assert.equal(res.body.mode, 'GATE_WINDOW')
  assert.equal(upsertCalls, 1)
  assert.equal(ownedSubjectCalls, 0)
})

test('getStudentIdQr includes an expiry timestamp in the signed student QR payload', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'
  let encodedPayload = null

  const { getStudentIdQr } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          name: 'Arman Dev',
          email: 'student@example.com',
          phone: '9800000000',
          role: 'STUDENT',
          student: {
            id: 'student-1',
            rollNumber: 'BCA-001',
            department: 'BCA',
            semester: 4,
            section: 'A'
          }
        })
      }
    },
    qrcode: {
      toDataURL: async (value) => {
        encodedPayload = value
        return 'data:image/png;base64,qr'
      }
    }
  }))

  const req = {
    user: { id: 'user-1', role: 'STUDENT' }
  }
  const res = createResponse()

  const startedAt = Date.now()
  await getStudentIdQr(req, res)
  const finishedAt = Date.now()

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.qrCode, 'data:image/png;base64,qr')

  const parsed = JSON.parse(encodedPayload)
  const expiresAt = new Date(parsed.payload.expiresAt)
  assert.equal(parsed.kid, 'legacy')
  assert.equal(parsed.payload.type, 'STUDENT_ID_CARD')
  assert.equal(parsed.payload.studentId, 'student-1')
  assert.equal(parsed.payload.semester, 4)
  assert.ok(!Number.isNaN(expiresAt.getTime()))

  const minExpiry = startedAt + (23 * 60 * 60 * 1000)
  const maxExpiry = finishedAt + (24 * 60 * 60 * 1000) + 5_000
  assert.ok(expiresAt.getTime() >= minExpiry)
  assert.ok(expiresAt.getTime() <= maxExpiry)
})

test('getStudentByIdCardQr rejects expired student ID QR payloads', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'

  const { getStudentByIdCardQr } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'shared.js'), {
    '../../utils/prisma': {
      student: {
        findUnique: async () => {
          throw new Error('should not query student for expired QR')
        }
      }
    },
    '../../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../../utils/security': {
      getRequiredSecret: () => 'test-qr-secret'
    }
  })

  const qrData = createSignedStudentIdQr({
    type: 'STUDENT_ID_CARD',
    studentId: 'student-1',
    semester: 4,
    expiresAt: new Date(Date.now() - 60_000).toISOString()
  })

  const result = await getStudentByIdCardQr(qrData)

  assert.deepEqual(result, {
    error: {
      status: 400,
      message: 'Student ID QR code has expired'
    }
  })
})

test('getStudentByIdCardQr rejects student ID QR payloads after the semester changes', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'

  const { getStudentByIdCardQr } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'shared.js'), {
    '../../utils/prisma': {
      student: {
        findUnique: async () => ({
          id: 'student-1',
          semester: 5,
          user: {
            id: 'user-1',
            name: 'Arman Dev',
            email: 'student@example.com',
            isActive: true
          }
        })
      }
    },
    '../../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../../utils/security': {
      getRequiredSecret: () => 'test-qr-secret'
    }
  })

  const qrData = createSignedStudentIdQr({
    type: 'STUDENT_ID_CARD',
    studentId: 'student-1',
    semester: 4,
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  })

  const result = await getStudentByIdCardQr(qrData)

  assert.deepEqual(result, {
    error: {
      status: 400,
      message: 'Student ID QR code is no longer valid for the current semester'
    }
  })
})

test('getOwnedSubject blocks coordinators from managing attendance outside their department', async () => {
  const { getOwnedSubject } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'shared.js'), {
    '../../utils/prisma': {
      subject: {
        findUnique: async () => ({
          id: 'subject-nursing-1',
          name: 'Clinical Practice',
          department: 'NURSING',
          instructorId: 'instructor-1',
          instructor: null
        })
      }
    },
    '../../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../../utils/security': {
      getRequiredSecret: () => 'test-qr-secret'
    }
  })

  const result = await getOwnedSubject('subject-nursing-1', {
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'CS' }
  })

  assert.deepEqual(result, {
    error: {
      status: 403,
      message: 'You can only manage attendance for subjects in your department'
    }
  })
})

test('exportMyMarksheetPdf streams a semester marksheet for published student results', async () => {
  const docOperations = []
  let rankingQueryCalled = false
  class MockPdfDocument {
    constructor() {
      this.y = 0
    }

    pipe(target) {
      this.target = target
      return this
    }

    fontSize(value) {
      docOperations.push(['fontSize', value])
      return this
    }

    text(value) {
      docOperations.push(['text', value])
      return this
    }

    moveDown() {
      docOperations.push(['moveDown'])
      return this
    }

    addPage() {
      docOperations.push(['addPage'])
      return this
    }

    fillColor(value) {
      docOperations.push(['fillColor', value])
      return this
    }

    end() {
      docOperations.push(['end'])
      return this
    }
  }

  const { exportMyMarksheetPdf } = loadWithMocks(resolveFromTest('src', 'controllers', 'marks.controller.js'), {
    '../utils/prisma': {
      $queryRaw: async () => {
        rankingQueryCalled = true
        return [{ studentId: 'student-1', rank: 1, cohortSize: 2 }]
      },
      mark: {
        findMany: async ({ where, distinct } = {}) => {
          if (distinct) {
            return [{ examType: 'FINAL' }]
          }

          if (where?.studentId === 'student-1') {
            return [
              {
                id: 'mark-1',
                studentId: 'student-1',
                subjectId: 'subject-1',
                obtainedMarks: 88,
                totalMarks: 100,
                remarks: 'Great work',
                subject: { name: 'Database Systems', code: 'DBS101', semester: 3 }
              },
              {
                id: 'mark-2',
                studentId: 'student-1',
                subjectId: 'subject-2',
                obtainedMarks: 76,
                totalMarks: 100,
                remarks: '',
                subject: { name: 'Operating Systems', code: 'OS201', semester: 3 }
              }
            ]
          }

          throw new Error('cohort marks should not be loaded into memory')
        },
        count: async () => 2
      },
      student: {
        findUnique: async () => ({
          id: 'student-1',
          rollNumber: 'STU-001',
          semester: 3,
          section: 'A',
          department: 'BCA',
          user: { name: 'Arman Dev', email: 'arman@example.com' }
        })
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 10, skip: 0 })
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/notifications': {
      createNotifications: async () => {}
    },
    pdfkit: MockPdfDocument
  })

  const req = {
    query: { examType: 'FINAL' },
    student: { id: 'student-1', semester: 3, department: 'BCA' }
  }
  const res = createResponse()

  await exportMyMarksheetPdf(req, res)

  assert.equal(res.headers['Content-Type'], 'application/pdf')
  assert.match(res.headers['Content-Disposition'], /marksheet-stu-001-sem-3-final\.pdf/i)
  assert.equal(rankingQueryCalled, true)
  assert.ok(docOperations.some((operation) => operation[0] === 'text' && /Semester Marksheet/i.test(operation[1])))
  assert.ok(docOperations.some((operation) => operation[0] === 'text' && /Database Systems/i.test(operation[1])))
  assert.ok(docOperations.some((operation) => operation[0] === 'end'))
})

test('getMyMarksSummary returns student rank metrics without peer leaderboard data', async () => {
  let rankingQueryCalled = false
  const { getMyMarksSummary } = loadWithMocks(resolveFromTest('src', 'controllers', 'marks.controller.js'), {
    '../utils/prisma': {
      $queryRaw: async () => {
        rankingQueryCalled = true
        return [{ studentId: 'student-1', rank: 1, cohortSize: 2 }]
      },
      mark: {
        findMany: async ({ where, distinct } = {}) => {
          if (distinct) {
            return [{ examType: 'FINAL' }]
          }

          if (where?.studentId === 'student-1') {
            return [
              {
                id: 'mark-1',
                studentId: 'student-1',
                subjectId: 'subject-1',
                obtainedMarks: 88,
                totalMarks: 100,
                remarks: '',
                subject: { name: 'Database Systems', code: 'DBS101', semester: 3 }
              }
            ]
          }

          throw new Error('cohort marks should not be loaded into memory')
        },
        count: async () => 1
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 10, skip: 0 })
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/notifications': {
      createNotifications: async () => {}
    },
    pdfkit: class MockPdfDocument {}
  })

  const req = {
    query: { examType: 'FINAL' },
    student: { id: 'student-1', semester: 3, department: 'BCA' }
  }
  const res = createResponse()

  await getMyMarksSummary(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(rankingQueryCalled, true)
  assert.equal(res.body.ranking.rank, 1)
  assert.equal(res.body.ranking.cohortSize, 2)
  assert.equal(res.body.ranking.percentile, 100)
  assert.equal('topStudents' in res.body.ranking, false)
})

test('getDayRange uses the configured attendance timezone for date boundaries', () => {
  const previousTimezone = process.env.ATTENDANCE_TIMEZONE
  process.env.ATTENDANCE_TIMEZONE = 'Asia/Kathmandu'
  try {
    const { getDayRange } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'shared.js'), {
      '../../utils/prisma': {},
      '../../utils/audit': {
        recordAuditLog: async () => {}
      },
      '../../utils/security': {
        getRequiredSecret: () => 'test-secret'
      }
    })

    const range = getDayRange('2026-04-04')

    assert.equal(range.start.toISOString(), '2026-04-03T18:15:00.000Z')
    assert.equal(range.end.toISOString(), '2026-04-04T18:15:00.000Z')
  } finally {
    if (previousTimezone === undefined) {
      delete process.env.ATTENDANCE_TIMEZONE
    } else {
      process.env.ATTENDANCE_TIMEZONE = previousTimezone
    }
  }
})

test('publishMarks publishes marks for a coordinator department and returns count', async () => {
  const updateManyCalls = []
  const countCalls = []
  const { publishMarks } = loadWithMocks(resolveFromTest('src', 'controllers', 'marks.controller.js'), {
    '../utils/prisma': {
      mark: {
        count: async (payload) => {
          countCalls.push(payload)
          return 2
        },
        updateMany: async (payload) => {
          updateManyCalls.push(payload)
          return { count: 2 }
        },
        findMany: async () => ([
          {
            student: { userId: 'user-student-1' },
            subject: { name: 'Database Systems' }
          },
          {
            student: { userId: 'user-student-2' },
            subject: { name: 'Database Systems' }
          }
        ])
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 10, skip: 0 })
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/notifications': {
      createNotifications: async () => ({ count: 2 })
    }
  })

  const req = {
    body: {
      subjectId: 'subject-1',
      examType: 'MIDTERM'
    },
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await publishMarks(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.count, 2)
  assert.equal(countCalls.length, 1)
  assert.equal(updateManyCalls.length, 1)
  assert.equal(updateManyCalls[0].where.subject.department, 'BCA')
  assert.equal(updateManyCalls[0].where.subjectId, 'subject-1')
  assert.equal(updateManyCalls[0].where.examType, 'MIDTERM')
})

test('deleteMarks blocks coordinators from deleting marks outside their department', async () => {
  const deleteCalls = []
  const { deleteMarks } = loadWithMocks(resolveFromTest('src', 'controllers', 'marks.controller.js'), {
    '../utils/prisma': {
      mark: {
        findUnique: async () => ({
          id: 'mark-1',
          studentId: 'student-1',
          subjectId: 'subject-1',
          examType: 'FINAL'
        }),
        delete: async (payload) => {
          deleteCalls.push(payload)
          return payload
        }
      },
      subject: {
        findUnique: async () => ({
          id: 'subject-1',
          name: 'Accounting',
          code: 'ACC101',
          department: 'BBS',
          instructorId: 'instructor-1',
          instructor: null
        })
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 20, skip: 0 })
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/notifications': {
      createNotifications: async () => {}
    },
    pdfkit: class MockPdfDocument {}
  })

  const req = {
    params: { id: 'mark-1' },
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await deleteMarks(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'You can only manage marks for subjects in your department'
  })
  assert.equal(deleteCalls.length, 0)
})

test('getMarksBySubject blocks coordinators from subjects outside their department', async () => {
  const findManyCalls = []
  const { getMarksBySubject } = loadWithMocks(resolveFromTest('src', 'controllers', 'marks.controller.js'), {
    '../utils/prisma': {
      subject: {
        findUnique: async () => ({
          id: 'subject-1',
          name: 'Accounting',
          code: 'ACC101',
          department: 'BBS',
          instructorId: 'instructor-1',
          instructor: null
        })
      },
      mark: {
        findMany: async (payload) => {
          findManyCalls.push(payload)
          return []
        },
        count: async () => 0
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 20, skip: 0 })
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/notifications': {
      createNotifications: async () => {}
    },
    pdfkit: class MockPdfDocument {}
  })

  const req = {
    params: { subjectId: 'subject-1' },
    query: {},
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await getMarksBySubject(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'You can only manage marks for subjects in your department'
  })
  assert.equal(findManyCalls.length, 0)
})

test('getMarksBySubject blocks instructors from subjects assigned to a different instructor', async () => {
  const findManyCalls = []
  const { getMarksBySubject } = loadWithMocks(resolveFromTest('src', 'controllers', 'marks.controller.js'), {
    '../utils/prisma': {
      subject: {
        findUnique: async () => ({
          id: 'subject-1',
          name: 'Accounting',
          code: 'ACC101',
          department: 'BCA',
          instructorId: 'instructor-2',
          instructor: null
        })
      },
      mark: {
        findMany: async (payload) => {
          findManyCalls.push(payload)
          return []
        },
        count: async () => 0
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 20, skip: 0 })
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/notifications': {
      createNotifications: async () => {}
    },
    pdfkit: class MockPdfDocument {}
  })

  const req = {
    params: { subjectId: 'subject-1' },
    query: {},
    user: { id: 'instructor-user-1', role: 'INSTRUCTOR' },
    instructor: { id: 'instructor-1' }
  }
  const res = createResponse()

  await getMarksBySubject(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'You can only manage marks for your assigned subjects'
  })
  assert.equal(findManyCalls.length, 0)
})

test('getMarksReview scopes coordinator queries to their department', async () => {
  const findManyCalls = []
  const countCalls = []
  const { getMarksReview } = loadWithMocks(resolveFromTest('src', 'controllers', 'marks.controller.js'), {
    '../utils/prisma': {
      mark: {
        findMany: async (payload) => {
          findManyCalls.push(payload)
          return []
        },
        count: async (payload) => {
          countCalls.push(payload)
          return 0
        }
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 20, skip: 0 })
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/notifications': {
      createNotifications: async () => {}
    },
    pdfkit: class MockPdfDocument {}
  })

  const req = {
    query: {
      examType: 'FINAL',
      subjectId: 'subject-1'
    },
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await getMarksReview(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(findManyCalls.length, 1)
  assert.equal(countCalls.length, 1)
  assert.deepEqual(findManyCalls[0].where, {
    subjectId: 'subject-1',
    examType: 'FINAL',
    subject: {
      department: 'BCA'
    }
  })
  assert.deepEqual(countCalls[0].where, findManyCalls[0].where)
})

test('getMarksReview blocks coordinators without a configured department', async () => {
  const findManyCalls = []
  const countCalls = []
  const { getMarksReview } = loadWithMocks(resolveFromTest('src', 'controllers', 'marks.controller.js'), {
    '../utils/prisma': {
      mark: {
        findMany: async (payload) => {
          findManyCalls.push(payload)
          return []
        },
        count: async (payload) => {
          countCalls.push(payload)
          return 0
        }
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 20, skip: 0 })
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/notifications': {
      createNotifications: async () => {}
    },
    pdfkit: class MockPdfDocument {}
  })

  const req = {
    query: {
      examType: 'FINAL',
      subjectId: 'subject-2'
    },
    user: { id: 'coordinator-user-2', role: 'COORDINATOR' },
    coordinator: { department: null }
  }
  const res = createResponse()

  await getMarksReview(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'Coordinator department is not configured'
  })
  assert.equal(findManyCalls.length, 0)
  assert.equal(countCalls.length, 0)
})

test('createRoutine blocks instructor double-booking with a specific error', async () => {
  const { createRoutine } = loadWithMocks(resolveFromTest('src', 'controllers', 'routine.controller.js'), {
    '../utils/prisma': {
      subject: {
        findUnique: async () => ({ id: 'subject-1', semester: 3, department: 'BCA' })
      },
      instructor: {
        findUnique: async () => ({ id: 'instructor-1', department: 'BCA' })
      },
      routine: {
        findFirst: async () => ({
          id: 'routine-2',
          instructorId: 'instructor-1',
          room: 'Room 102'
        })
      }
    }
  })

  const req = {
    body: {
      subjectId: 'subject-1',
      instructorId: 'instructor-1',
      department: 'BCA',
      semester: 3,
      section: 'A',
      dayOfWeek: 'SUNDAY',
      startTime: '10:00',
      endTime: '11:00',
      room: 'Room 101'
    }
  }
  const res = createResponse()

  await createRoutine(req, res)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, {
    message: 'This instructor already has a class at this time.'
  })
})

test('createRoutine allows combined classes sharing the same room and combinedGroupId', async () => {
  const createCalls = []
  const findFirstCalls = []
  const { createRoutine } = loadWithMocks(resolveFromTest('src', 'controllers', 'routine.controller.js'), {
    '../utils/prisma': {
      subject: {
        findUnique: async () => ({ id: 'subject-1', semester: 3, department: 'BCA' })
      },
      instructor: {
        findUnique: async () => ({ id: 'instructor-1', department: 'BCA' })
      },
      routine: {
        findFirst: async (payload) => {
          findFirstCalls.push(payload)
          return null
        },
        create: async (payload) => {
          createCalls.push(payload)
          return {
            id: 'routine-1',
            ...payload.data,
            subject: { id: 'subject-1', name: 'DSA', code: 'CSC201', semester: 3, department: 'BCA' },
            instructor: { id: 'instructor-1', user: { name: 'Instructor One' } }
          }
        }
      }
    }
  })

  const req = {
    body: {
      subjectId: 'subject-1',
      instructorId: 'instructor-1',
      department: 'BCA',
      semester: 3,
      section: 'A',
      combinedGroupId: '123e4567-e89b-12d3-a456-426614174000',
      dayOfWeek: 'SUNDAY',
      startTime: '10:00',
      endTime: '11:00',
      room: 'Room 101'
    }
  }
  const res = createResponse()

  await createRoutine(req, res)

  assert.equal(res.statusCode, 201)
  assert.equal(findFirstCalls[0].where.OR[0].combinedGroupId.not, '123e4567-e89b-12d3-a456-426614174000')
  assert.equal(createCalls[0].data.combinedGroupId, '123e4567-e89b-12d3-a456-426614174000')
})

test('createRoutine returns a friendly error when the database uniqueness guard catches an instructor race', async () => {
  const { createRoutine } = loadWithMocks(resolveFromTest('src', 'controllers', 'routine.controller.js'), {
    '../utils/prisma': {
      subject: {
        findUnique: async () => ({ id: 'subject-1', semester: 3, department: 'BCA' })
      },
      instructor: {
        findUnique: async () => ({ id: 'instructor-1', department: 'BCA' })
      },
      routine: {
        findFirst: async () => null,
        create: async () => {
          const error = new Error('Unique constraint failed')
          error.code = 'P2002'
          throw error
        }
      }
    }
  })

  const req = {
    body: {
      subjectId: 'subject-1',
      instructorId: 'instructor-1',
      department: 'BCA',
      semester: 3,
      section: 'A',
      dayOfWeek: 'SUNDAY',
      startTime: '10:00',
      endTime: '11:00',
      room: 'Room 101'
    }
  }
  const res = createResponse()

  await createRoutine(req, res)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, {
    message: 'This instructor already has a class at this time.'
  })
})

test('getAllRoutines shows all section routines to students without an assigned section', async () => {
  const findManyCalls = []

  const { getAllRoutines } = loadWithMocks(resolveFromTest('src', 'controllers', 'routine.controller.js'), {
    '../utils/prisma': {
      student: {
        findUnique: async () => ({
          id: 'student-1',
          semester: 3,
          department: 'BCA',
          section: null
        })
      },
      routine: {
        findMany: async (payload) => {
          findManyCalls.push(payload)
          return []
        }
      }
    }
  })

  const req = {
    query: {},
    user: { id: 'user-student-1', role: 'STUDENT' }
  }
  const res = createResponse()

  await getAllRoutines(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(findManyCalls.length, 1)
  assert.equal(findManyCalls[0].where.department, 'BCA')
  assert.equal(findManyCalls[0].where.semester, 3)
  assert.equal('OR' in findManyCalls[0].where, false)
})

test('getAllSubjects scopes coordinator queries to their own department', async () => {
  const findManyCalls = []

  const { getAllSubjects } = loadWithMocks(resolveFromTest('src', 'controllers', 'subject.controller.js'), {
    '../utils/prisma': {
      department: {
        findFirst: async () => ({ name: 'BCA', code: 'BCA' })
      },
      subject: {
        findMany: async (payload) => {
          findManyCalls.push(payload)
          return []
        },
        count: async () => 0
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 20, skip: 0 })
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/enrollment': {
      enrollMatchingStudentsInSubject: async () => {},
      syncMatchingStudentsForSubject: async () => {}
    }
  })

  const req = {
    query: {},
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await getAllSubjects(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(findManyCalls.length, 1)
  assert.deepEqual(findManyCalls[0].where, {
    AND: [
      {},
      {
        department: {
          in: ['BCA']
        }
      }
    ]
  })
})

test('createSubject blocks coordinators from creating subjects outside their department', async () => {
  const { createSubject } = loadWithMocks(resolveFromTest('src', 'controllers', 'subject.controller.js'), {
    '../utils/prisma': {
      department: {
        findFirst: async ({ where }) => {
          if (where?.OR?.some((entry) => entry.name === 'BCA' || entry.code === 'BCA')) {
            return { name: 'BCA', code: 'BCA' }
          }

          return null
        }
      },
      subject: {
        findUnique: async () => null,
        create: async () => {
          throw new Error('should not create')
        }
      }
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/enrollment': {
      enrollMatchingStudentsInSubject: async () => {},
      syncMatchingStudentsForSubject: async () => {}
    }
  })

  const req = {
    body: {
      name: 'Accounting',
      code: 'ACC101',
      description: '',
      semester: 1,
      department: 'BBS',
      instructorId: ''
    },
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await createSubject(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'You can only manage subjects in your own department'
  })
})

test('getAllRoutines scopes coordinator queries to their own department', async () => {
  const findManyCalls = []

  const { getAllRoutines } = loadWithMocks(resolveFromTest('src', 'controllers', 'routine.controller.js'), {
    '../utils/prisma': {
      department: {
        findFirst: async () => ({ name: 'BCA', code: 'BCA' })
      },
      routine: {
        findMany: async (payload) => {
          findManyCalls.push(payload)
          return []
        }
      }
    }
  })

  const req = {
    query: {},
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await getAllRoutines(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(findManyCalls.length, 1)
  assert.deepEqual(findManyCalls[0].where, {
    AND: [
      {},
      {
        department: {
          in: ['BCA']
        }
      }
    ]
  })
})

test('createRoutine blocks coordinators from creating routines outside their department', async () => {
  const { createRoutine } = loadWithMocks(resolveFromTest('src', 'controllers', 'routine.controller.js'), {
    '../utils/prisma': {
      department: {
        findFirst: async ({ where }) => {
          if (where?.OR?.some((entry) => entry.name === 'BCA' || entry.code === 'BCA')) {
            return { name: 'BCA', code: 'BCA' }
          }

          return null
        }
      },
      subject: {
        findUnique: async () => ({ id: 'subject-1', semester: 3, department: 'BBS' })
      },
      instructor: {
        findUnique: async () => ({ id: 'instructor-1', department: 'BBS' })
      },
      routine: {
        findFirst: async () => null,
        create: async () => {
          throw new Error('should not create')
        }
      }
    }
  })

  const req = {
    body: {
      subjectId: 'subject-1',
      instructorId: 'instructor-1',
      department: 'BBS',
      semester: 3,
      section: 'A',
      dayOfWeek: 'SUNDAY',
      startTime: '10:00',
      endTime: '11:00',
      room: 'Room 101'
    },
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await createRoutine(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'You can only manage routines in your own department'
  })
})

test('getActivity marks the current session by id without selecting tokenHash in the sessions query', async () => {
  const refreshTokenFindManyCalls = []
  const refreshTokenFindFirstCalls = []

  const { getActivity } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      auditLog: {
        findMany: async () => ([
          {
            id: 'audit-1',
            action: 'LOGIN_SUCCESS',
            entityType: 'AUTH',
            metadata: { ipAddress: '127.0.0.1' },
            createdAt: new Date('2026-04-13T08:00:00.000Z')
          }
        ])
      },
      refreshToken: {
        findFirst: async (payload) => {
          refreshTokenFindFirstCalls.push(payload)
          return { id: 'session-2' }
        },
        findMany: async (payload) => {
          refreshTokenFindManyCalls.push(payload)
          return [
            {
              id: 'session-1',
              ipAddress: '127.0.0.1',
              userAgent: 'Browser A',
              createdAt: new Date('2026-04-13T08:00:00.000Z'),
              lastUsedAt: new Date('2026-04-13T09:00:00.000Z'),
              expiresAt: new Date('2026-04-20T09:00:00.000Z')
            },
            {
              id: 'session-2',
              ipAddress: '127.0.0.2',
              userAgent: 'Browser B',
              createdAt: new Date('2026-04-13T10:00:00.000Z'),
              lastUsedAt: new Date('2026-04-13T11:00:00.000Z'),
              expiresAt: new Date('2026-04-20T11:00:00.000Z')
            }
          ]
        }
      }
    },
    '../utils/token': {
      signAccessToken: () => 'access-token',
      signRefreshToken: () => 'refresh-token',
      verifyRefreshToken: () => ({ id: 'user-1' }),
      hashToken: () => 'current-hash',
      getRefreshTokenExpiry: () => new Date(),
      getRefreshCookieOptions: () => ({})
    }
  }))

  const req = {
    cookies: {
      refreshToken: 'refresh-token'
    },
    user: {
      id: 'user-1'
    }
  }
  const res = createResponse()

  await getActivity(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(refreshTokenFindFirstCalls.length, 1)
  assert.deepEqual(refreshTokenFindFirstCalls[0].select, { id: true })
  assert.equal(refreshTokenFindFirstCalls[0].where.tokenHash, 'current-hash')
  assert.equal(refreshTokenFindManyCalls.length, 1)
  assert.equal(refreshTokenFindManyCalls[0].select.tokenHash, undefined)
  assert.deepEqual(res.body.sessions.map((session) => ({
    id: session.id,
    current: session.current
  })), [
    { id: 'session-1', current: false },
    { id: 'session-2', current: true }
  ])
  assert.equal(Object.prototype.hasOwnProperty.call(res.body.sessions[0], 'tokenHash'), false)
})

test('submitStudentIntake sanitizes profile fields before persisting the application', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'

  const upsertCalls = []
  const { submitStudentIntake } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      studentApplication: {
        findUnique: async () => null,
        upsert: async (payload) => {
          upsertCalls.push(payload)
          return payload
        }
      },
      user: {
        findUnique: async () => null
      }
    }
  }))

  const req = {
    body: {
      fullName: '<b>Arman Dev</b>',
      email: 'arman@example.com',
      phone: '<i>9800000000</i>',
      fatherName: '<script>alert(1)</script>Father Name',
      motherName: '<div>Mother Name</div>',
      fatherPhone: '<span>9800000001</span>',
      motherPhone: '<span>9800000002</span>',
      bloodGroup: '<b>A+</b>',
      localGuardianName: '<p>Guardian Name</p>',
      localGuardianAddress: '<img src=x onerror=1>Kathmandu',
      localGuardianPhone: '<span>9800000003</span>',
      permanentAddress: '<div>Bhaktapur</div>',
      temporaryAddress: '<div>Lalitpur</div>',
      dateOfBirth: '2005-01-01',
      preferredDepartment: 'BCA'
    }
  }
  const res = createResponse()

  await submitStudentIntake(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(upsertCalls.length, 1)
  const { dateOfBirth, ...createPayload } = upsertCalls[0].create
  assert.ok(dateOfBirth instanceof Date)
  assert.equal(dateOfBirth.toISOString(), '2005-01-01T00:00:00.000Z')
  assert.deepEqual(createPayload, {
    fullName: 'Arman Dev',
    phone: '9800000000',
    fatherName: 'Father Name',
    motherName: 'Mother Name',
    fatherPhone: '9800000001',
    motherPhone: '9800000002',
    bloodGroup: 'A+',
    localGuardianName: 'Guardian Name',
    localGuardianAddress: 'Kathmandu',
    localGuardianPhone: '9800000003',
    permanentAddress: 'Bhaktapur',
    temporaryAddress: 'Lalitpur',
    email: 'arman@example.com',
    preferredDepartment: 'BCA',
    preferredSemester: 1,
    preferredSection: null
  })
})

test('updateUser sanitizes plain-text profile fields before persisting', async () => {
  const userUpdates = []
  const studentUpdates = []
  const { updateUser } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      user: {
        findFirst: async () => ({
          id: 'user-1',
          role: 'STUDENT',
          student: {
            id: 'student-1',
            semester: 3,
            section: 'A',
            department: 'BCA'
          },
          instructor: null,
          coordinator: null
        }),
        update: async (payload) => {
          userUpdates.push(payload)
          return {
            id: 'user-1',
            name: payload.data.name
          }
        }
      },
      student: {
        update: async (payload) => {
          studentUpdates.push(payload)
          return {
            id: 'student-1',
            semester: 3,
            section: payload.data.section,
            department: 'BCA'
          }
        }
      }
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {},
      syncStudentEnrollmentForSemester: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const req = {
    params: { id: 'user-1' },
    body: {
      name: '<b>Student One</b>',
      phone: '<span>9800000000</span>',
      address: '<img src=x onerror=1>Kathmandu',
      section: '<i>B</i>'
    },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const res = createResponse()

  await updateUser(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(userUpdates.length, 1)
  assert.deepEqual(userUpdates[0].data, {
    name: 'Student One',
    phone: '9800000000',
    address: 'Kathmandu'
  })
  assert.equal(studentUpdates.length, 1)
  assert.equal(studentUpdates[0].data.section, 'B')
})

test('addMarks sanitizes remarks before storing them', async () => {
  const createCalls = []
  const { addMarks } = loadWithMocks(resolveFromTest('src', 'controllers', 'marks.controller.js'), {
    '../utils/prisma': {
      subject: {
        findUnique: async () => ({
          id: 'subject-1',
          instructorId: 'instructor-1',
          instructor: {
            id: 'instructor-1',
            user: { name: 'Instructor One', email: 'instructor@example.com' }
          }
        })
      },
      subjectEnrollment: {
        findUnique: async () => ({ subjectId: 'subject-1', studentId: 'student-1' })
      },
      mark: {
        create: async (payload) => {
          createCalls.push(payload)
          return {
            id: 'mark-1',
            studentId: 'student-1',
            subjectId: 'subject-1',
            obtainedMarks: payload.data.obtainedMarks,
            totalMarks: payload.data.totalMarks,
            remarks: payload.data.remarks,
            student: { user: { name: 'Arman Dev' } },
            subject: { name: 'Database Systems', code: 'DBS101' }
          }
        }
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 10, skip: 0 })
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/notifications': {
      createNotifications: async () => {}
    },
    pdfkit: class MockPdfDocument {}
  })

  const req = {
    body: {
      studentId: 'student-1',
      subjectId: 'subject-1',
      examType: 'FINAL',
      totalMarks: 100,
      obtainedMarks: 88,
      remarks: '<img src=x onerror=1>Great&nbsp;work'
    },
    user: { id: 'instructor-user-1', role: 'INSTRUCTOR' },
    instructor: { id: 'instructor-1' }
  }
  const res = createResponse()

  await addMarks(req, res)

  assert.equal(res.statusCode, 201)
  assert.equal(createCalls.length, 1)
  assert.equal(createCalls[0].data.remarks, 'Great work')
  assert.equal(createCalls[0].data.grade, 'A')
  assert.equal(createCalls[0].data.gradePoint, 3.6)
  assert.equal(res.body.mark.remarks, 'Great work')
})
