/* global jest, describe, beforeEach, test, expect */

if (typeof jest === 'undefined') {
  const { test } = require('node:test')

  test('auth.service Jest suite requires Jest', { skip: true }, () => {})
} else {
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret'
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret'
  process.env.LOGIN_CAPTCHA_SECRET = process.env.LOGIN_CAPTCHA_SECRET || 'test-login-captcha-secret'
  process.env.NODE_ENV = process.env.NODE_ENV || 'test'

  jest.mock('../src/utils/prisma', () => ({
    $transaction: jest.fn(async (callback) => callback(require('../src/utils/prisma'))),
    user: {
      findUnique: jest.fn(),
      update: jest.fn()
    },
    refreshToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn()
    }
  }))

  jest.mock('../src/utils/redis', () => ({
    getReadyRedisClient: jest.fn(),
    getRedisClient: jest.fn(),
    isRedisConfigured: jest.fn(() => false)
  }))

  jest.mock('bcryptjs', () => ({
    compare: jest.fn()
  }))

  jest.mock('../src/utils/token', () => ({
    signAccessToken: jest.fn(() => 'access-token'),
    signRefreshToken: jest.fn(() => 'new-refresh-token'),
    verifyRefreshToken: jest.fn(() => ({ id: 'user-1', role: 'STUDENT' })),
    hashToken: jest.fn((token) => `hash:${token}`),
    getRefreshTokenExpiry: jest.fn(() => new Date('2030-01-01T00:00:00.000Z')),
    getRefreshCookieOptions: jest.fn(() => ({ httpOnly: true }))
  }))

  jest.mock('../src/utils/accessTokenRevocation', () => ({
    revokeAccessTokenFromRequest: jest.fn(),
    revokeAllAccessTokensForUser: jest.fn(),
    trackAccessToken: jest.fn()
  }))

  jest.mock('../src/utils/audit', () => ({
    recordAuditLog: jest.fn()
  }))

  jest.mock('../src/utils/security', () => ({
    hashPassword: jest.fn(async () => 'hashed-new-password'),
    isKnownWeakPassword: jest.fn(() => false)
  }))

  jest.mock('../src/utils/sanitize', () => ({
    sanitizePlainText: jest.fn((value) => value),
    sanitizeOptionalPlainText: jest.fn((value) => value)
  }))

  jest.mock('../src/middleware/upload.middleware', () => ({
    removeUploadedFile: jest.fn()
  }))

  const bcrypt = require('bcryptjs')
  const prisma = require('../src/utils/prisma')
  const { revokeAccessTokenFromRequest } = require('../src/utils/accessTokenRevocation')
  const authService = require('../src/services/auth.service')

  const callService = async (serviceFn, context) => {
    const result = require('../src/utils/serviceResult').createServiceResponder()
    return (await serviceFn(context, result)) || result.toServiceResult()
  }

  const statusCodeOf = (serviceResult) => serviceResult.statusCode || 200

  const createContext = (overrides = {}) => ({
    body: {},
    cookies: {},
    user: { id: 'user-1', role: 'STUDENT' },
    ip: '127.0.0.1',
    get: jest.fn(() => ''),
    ...overrides
  })

  const baseUser = (overrides = {}) => ({
    id: 'user-1',
    name: 'Test User',
    email: 'student@example.com',
    password: 'hashed-password',
    role: 'STUDENT',
    avatar: null,
    isActive: true,
    emailVerified: true,
    mustChangePassword: false,
    profileCompleted: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    deletedAt: null,
    ...overrides
  })

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma))
    prisma.refreshToken.create.mockResolvedValue({})
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 })
    prisma.user.update.mockImplementation(async ({ data }) => baseUser(data))
  })

  describe('auth.service login', () => {
    test('valid credentials returns accessToken and user', async () => {
      const user = baseUser()
      prisma.user.findUnique
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce({ ...user, student: { id: 'student-1' } })
      bcrypt.compare.mockResolvedValueOnce(true)

      const result = await callService(authService.login, createContext({
        body: { email: user.email, password: 'correct-password' }
      }))

      expect(statusCodeOf(result)).toBe(200)
      expect(result.body).toEqual(expect.objectContaining({
        accessToken: 'access-token',
        user: expect.objectContaining({
          id: user.id,
          email: user.email,
          role: user.role
        })
      }))
    })

    test('invalid password returns 401 and increments failedLoginAttempts', async () => {
      const user = baseUser()
      prisma.user.findUnique.mockResolvedValueOnce(user)
      bcrypt.compare.mockResolvedValueOnce(false)

      const result = await callService(authService.login, createContext({
        body: { email: user.email, password: 'wrong-password' }
      }))

      expect(statusCodeOf(result)).toBe(401)
      expect(result.body).toEqual({ message: 'Invalid credentials' })
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 1,
          lockedUntil: null
        }
      })
    })

    test('account locked returns 401 with retryAfter', async () => {
      const lockedUntil = new Date(Date.now() + 60_000)
      prisma.user.findUnique.mockResolvedValueOnce(baseUser({ lockedUntil }))
      bcrypt.compare.mockResolvedValueOnce(true)

      const result = await callService(authService.login, createContext({
        body: { email: 'student@example.com', password: 'correct-password' }
      }))

      expect(statusCodeOf(result)).toBe(401)
      expect(result.body).toEqual({
        message: 'Invalid credentials',
        retryAfter: expect.any(Number)
      })
    })

    test('third failed attempt returns requiresCaptcha', async () => {
      const user = baseUser({ failedLoginAttempts: 2 })
      prisma.user.findUnique.mockResolvedValueOnce(user)
      bcrypt.compare.mockResolvedValueOnce(false)

      const result = await callService(authService.login, createContext({
        body: { email: user.email, password: 'wrong-password' }
      }))

      expect(statusCodeOf(result)).toBe(401)
      expect(result.body).toEqual(expect.objectContaining({
        message: 'Please complete the security check to continue.',
        requiresCaptcha: true,
        captchaChallenge: expect.any(Object)
      }))
    })
  })

  describe('auth.service changePassword', () => {
    test('same password reuse returns 400', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(baseUser())
      bcrypt.compare
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)

      const result = await callService(authService.changePassword, createContext({
        body: {
          currentPassword: 'CurrentPassword1!',
          newPassword: 'CurrentPassword1!'
        }
      }))

      expect(statusCodeOf(result)).toBe(400)
      expect(result.body).toEqual({
        message: 'New password must be different from your current password'
      })
    })

    test('wrong current password returns 400', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(baseUser())
      bcrypt.compare.mockResolvedValueOnce(false)

      const result = await callService(authService.changePassword, createContext({
        body: {
          currentPassword: 'WrongPassword1!',
          newPassword: 'NewPassword1!'
        }
      }))

      expect(statusCodeOf(result)).toBe(400)
      expect(result.body).toEqual({ message: 'Current password is incorrect' })
    })
  })

  test('refreshSession reused refresh token revokes all sessions and returns 401', async () => {
    prisma.refreshToken.findUnique.mockResolvedValueOnce({
      id: 'session-1',
      userId: 'user-1',
      revokedAt: new Date('2026-01-01T00:00:00.000Z'),
      user: baseUser()
    })

    const result = await callService(authService.refresh, createContext({
      cookies: { refreshToken: 'old-refresh-token' }
    }))

    expect(statusCodeOf(result)).toBe(401)
    expect(result.body).toEqual({ message: 'Refresh token is invalid or expired' })
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        revokedAt: null
      },
      data: { revokedAt: expect.any(Date) }
    })
  })

  test('logout valid session revokes access token and refresh token', async () => {
    const result = await callService(authService.logout, createContext({
      cookies: { refreshToken: 'valid-refresh-token' }
    }))

    expect(statusCodeOf(result)).toBe(200)
    expect(result.body).toEqual({ message: 'Logged out successfully' })
    expect(revokeAccessTokenFromRequest).toHaveBeenCalled()
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: 'hash:valid-refresh-token',
        revokedAt: null
      },
      data: { revokedAt: expect.any(Date) }
    })
  })
}
