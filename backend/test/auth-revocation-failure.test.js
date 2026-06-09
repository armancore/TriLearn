const test = require('node:test')
const assert = require('node:assert/strict')
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

const callService = async (serviceFn, context) => {
  const { createServiceResponder } = require('../src/utils/serviceResult')
  const result = createServiceResponder()
  return (await serviceFn(context, result)) || result.toServiceResult()
}

const createContext = (overrides = {}) => ({
  body: {},
  cookies: {},
  user: { id: 'user-1', role: 'STUDENT' },
  ip: '127.0.0.1',
  get: () => '',
  ...overrides
})

test('logout fails closed when access token revocation cannot be stored', async () => {
  let refreshRevoked = false
  const { logout } = loadWithMocks(resolveFromTest('src', 'services', 'auth.session.service.js'), {
    '../utils/prisma': {
      refreshToken: {
        updateMany: async () => {
          refreshRevoked = true
        }
      },
      user: {
        findUnique: async () => null,
        update: async () => ({})
      }
    },
    '../utils/logger': {
      warn: () => {},
      error: () => {}
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/token': {
      verifyRefreshToken: () => ({ id: 'user-1', role: 'STUDENT' }),
      hashToken: (token) => `hash:${token}`,
      getRefreshCookieOptions: () => ({ httpOnly: true })
    },
    '../utils/accessTokenRevocation': {
      revokeAccessTokenFromRequest: async () => {
        throw new Error('redis unavailable')
      },
      revokeAllAccessTokensForUser: async () => 0
    },
    './captcha.service': {
      validateLoginCaptcha: async () => true,
      getLoginCaptchaSecret: () => 'secret',
      shouldRequireLoginCaptcha: () => false,
      buildLoginCaptchaResponse: () => ({ statusCode: 401, body: {} }),
      LOGIN_CAPTCHA_THRESHOLD: 3
    },
    './session.service': {
      issueAuthSession: async () => ({ accessToken: 'access', refreshToken: 'refresh' }),
      buildAuthUser: (user) => user
    },
    './auth.shared.service': {
      getProfileSelect: () => ({}),
      getRequestIpAddress: () => '127.0.0.1',
      getRequestUserAgent: () => 'test-agent',
      getUserSelect: () => ({}),
      waitForMinimumDuration: async () => {}
    }
  })

  const result = await callService(logout, createContext({
    cookies: { refreshToken: 'valid-refresh-token' }
  }))

  assert.equal(result.statusCode, 503)
  assert.deepEqual(result.body, {
    message: 'Unable to complete this security-sensitive action right now. Please try again.'
  })
  assert.equal(refreshRevoked, false)
})

test('changePassword does not return success when current access token revocation fails', async () => {
  let passwordUpdated = false
  const { changePassword } = loadWithMocks(resolveFromTest('src', 'services', 'auth.account.service.js'), {
    '../utils/prisma': {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          password: 'old-hash'
        }),
        update: async ({ data }) => {
          passwordUpdated = true
          return {
            id: 'user-1',
            email: 'student@example.com',
            role: 'STUDENT',
            ...data
          }
        }
      }
    },
    'bcryptjs': {
      compare: async (value) => value === 'CurrentPassword1!'
    },
    '../utils/security': {
      hashPassword: async () => 'new-hash',
      isKnownWeakPassword: () => false
    },
    '../utils/token': {
      hashToken: (token) => `hash:${token}`
    },
    '../utils/accessTokenRevocation': {
      revokeAccessTokenFromRequest: async () => {
        throw new Error('redis unavailable')
      }
    },
    './session.service': {
      buildAuthUser: (user) => user
    },
    './auth.shared.service': {
      waitForMinimumDuration: async () => {}
    },
    '../utils/sanitize': {
      sanitizePlainText: (value) => value
    },
    '../utils/adminHelpers': {
      normalizeEmail: (value) => String(value || '').toLowerCase(),
      sanitizeOptionalPlainText: (value) => value
    }
  })

  const result = await callService(changePassword, createContext({
    body: {
      currentPassword: 'CurrentPassword1!',
      newPassword: 'NewPassword1!'
    }
  }))

  assert.equal(passwordUpdated, true)
  assert.equal(result.statusCode, 503)
  assert.deepEqual(result.body, {
    message: 'Unable to complete this security-sensitive action right now. Please try again.'
  })
})
