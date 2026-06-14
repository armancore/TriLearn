const { createServiceResponder } = require('../utils/serviceResult')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const { recordAuditLog } = require('../utils/audit')
const { normalizeEmail } = require('../utils/adminHelpers')
const {
  verifyRefreshToken,
  hashToken,
  getRefreshCookieOptions,
  getAccessCookieOptions,
  ACCESS_TOKEN_COOKIE_NAME
} = require('../utils/token')
const { revokeAccessTokenFromRequest, revokeAllAccessTokensForUser } = require('../utils/accessTokenRevocation')
const { clearCsrfCookie } = require('../middleware/csrf.middleware')
const {
  validateLoginCaptcha,
  getLoginCaptchaSecret,
  shouldRequireLoginCaptcha,
  buildLoginCaptchaResponse,
  LOGIN_CAPTCHA_THRESHOLD
} = require('./captcha.service')
const { issueAuthSession, buildAuthUser } = require('./session.service')
const {
  getProfileSelect,
  getRequestIpAddress,
  getRequestUserAgent,
  getUserSelect,
  waitForMinimumDuration
} = require('./auth.shared.service')

const isMobileClient = (context) => String(context.get('x-client-type') || '').toLowerCase() === 'mobile'
const MAX_FAILED_LOGIN_ATTEMPTS = 5
const LOGIN_LOCKOUT_MINUTES = 15
const LOGOUT_MIN_RESPONSE_MS = 75
const LOGIN_MIN_RESPONSE_MS = 75
const GENERIC_DISABLED_ACCOUNT_MESSAGE = 'Your account has been disabled. Please contact the administration.'
const DUMMY_PASSWORD_BCRYPT_ROUNDS = 12
const DUMMY_PASSWORD_INPUT = crypto.randomBytes(32).toString('hex')
const DUMMY_PASSWORD_TEST_DOUBLE_HASH = '$2b$12$EDWDkml0BGBHZEdSNK9vgOvUBfKrlwom1MuWP/Se30mxykJNmJ/sC'
const DUMMY_PASSWORD_HASH = typeof bcrypt.hashSync === 'function'
  ? bcrypt.hashSync(DUMMY_PASSWORD_INPUT, DUMMY_PASSWORD_BCRYPT_ROUNDS)
  : DUMMY_PASSWORD_TEST_DOUBLE_HASH
const refreshUserSelect = getUserSelect()
const REVOCATION_UNAVAILABLE_RESPONSE = {
  message: 'Unable to complete this security-sensitive action right now. Please try again.'
}
const loginUserSelect = {
  id: true,
  email: true,
  password: true,
  role: true,
  isActive: true,
  emailVerified: true,
  mustChangePassword: true,
  profileCompleted: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  deletedAt: true
}

const clearAccessCookie = (result, context) => {
  result.expireCookie(ACCESS_TOKEN_COOKIE_NAME, getAccessCookieOptions(context))
}

const getLoginLockoutExpiry = () => {
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + LOGIN_LOCKOUT_MINUTES)
  return expiresAt
}
// ================================
// LOGIN
// ================================
/**
 * Authenticates a user, enforces lockout/captcha checks, creates a refresh
 * session, and returns the access token payload.
 * @param {Record<string, any> & { body: { email: string, password: string, captchaToken?: string, captchaAnswer?: string }, get: (name: string) => string | undefined }} context - Login request context.
 * @param {import('../utils/serviceResult').ServiceResponder} [result] - Service result responder.
 * @returns {Promise<import('../utils/serviceResult').ServiceResult | void>} Service result.
 */
const login = async (context, result = createServiceResponder()) => {
  const startedAt = Date.now()

  const { email: rawEmail, password, captchaToken, captchaAnswer } = context.body
  const email = normalizeEmail(rawEmail)

  const user = await prisma.user.findUnique({
    where: { email },
    select: loginUserSelect
  })

  const passwordHash = user?.password || DUMMY_PASSWORD_HASH
  const isPasswordValid = await bcrypt.compare(password, passwordHash)

  if (!user) {
    await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)
    return result.withStatus(401, { message: 'Invalid credentials' })
  }

  if (user.deletedAt) {
    await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)
    return result.withStatus(401, { message: 'Invalid credentials' })
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const retryAfterSeconds = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000))
    await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)
    return result.withStatus(401, {
      message: 'Invalid credentials',
      retryAfter: retryAfterSeconds
    })
  }

  const requiresLoginCaptcha = shouldRequireLoginCaptcha(user)
  const hasValidLoginCaptcha = !requiresLoginCaptcha || (
    getLoginCaptchaSecret() !== null &&
    await validateLoginCaptcha({ email, captchaToken, captchaAnswer })
  )

  // Always enforce captcha once threshold is reached to avoid password-oracle responses.
  if (requiresLoginCaptcha && !hasValidLoginCaptcha) {
    await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)
    const captchaResponse = buildLoginCaptchaResponse(email)
    return result.withStatus(captchaResponse.statusCode, captchaResponse.body)
  }

  if (!isPasswordValid) {
    const failedLoginAttempts = (user.failedLoginAttempts || 0) + 1
    const shouldLockAccount = failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts,
        lockedUntil: shouldLockAccount ? getLoginLockoutExpiry() : null
      }
    })

    await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)

    if (failedLoginAttempts >= LOGIN_CAPTCHA_THRESHOLD && !shouldLockAccount) {
      const captchaResponse = buildLoginCaptchaResponse(email)
      return result.withStatus(captchaResponse.statusCode, captchaResponse.body)
    }

    return result.withStatus(401, { message: 'Invalid credentials' })
  }

  if (!user.isActive) {
    logger.warn('Suspended user login blocked', {
      userId: user.id,
      email: user.email
    })

    await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)
    return result.withStatus(403, {
      message: GENERIC_DISABLED_ACCOUNT_MESSAGE
    })
  }

  if (user.failedLoginAttempts || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    })
  }

  const session = await issueAuthSession(user, result, context, null, {
    setRefreshCookie: !isMobileClient(context)
  })
  const authUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: getProfileSelect()
  })

  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'AUTH_LOGIN',
    entityType: 'AuthSession',
    metadata: {
      ipAddress: getRequestIpAddress(context),
      userAgent: getRequestUserAgent(context)
    }
  })

  await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)
  const responseBody = {
    message: user.mustChangePassword
      ? 'Login successful. Please change your password to continue.'
      : 'Login successful!',
    user: buildAuthUser(authUser || user)
  }

  if (isMobileClient(context)) {
    responseBody.token = session.accessToken
    responseBody.accessToken = session.accessToken
    responseBody.refreshToken = session.refreshToken
  }

  result.ok(responseBody)
}


const refreshSession = async (context, result, refreshToken, { includeRefreshToken = false, setRefreshCookie = true } = {}) => {
  try {
    if (!refreshToken) {
      return result.withStatus(401, { message: 'Refresh token is required' })
    }

    const decoded = verifyRefreshToken(refreshToken)
    const tokenHash = hashToken(refreshToken)
    const now = new Date()
    const storedRefreshToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: { select: refreshUserSelect }
      }
    })

    if (storedRefreshToken?.userId === decoded.id && storedRefreshToken.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: {
          userId: decoded.id,
          revokedAt: null
        },
        data: { revokedAt: now }
      })

      result.expireCookie('refreshToken', {
        ...getRefreshCookieOptions(context),
        expires: new Date(0)
      })
      clearAccessCookie(result, context)
      clearCsrfCookie(result, context)

      logger.warn('Refresh token reuse detected; revoked all active sessions', {
        userId: decoded.id,
        sessionId: storedRefreshToken.id,
        ipAddress: getRequestIpAddress(context),
        userAgent: getRequestUserAgent(context)
      })

      await recordAuditLog({
        actorId: decoded.id,
        actorRole: storedRefreshToken.user?.role || decoded.role,
        action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'AuthSession',
        metadata: {
          sessionId: storedRefreshToken.id,
          ipAddress: getRequestIpAddress(context),
          userAgent: getRequestUserAgent(context)
        }
      })

      return result.withStatus(401, { message: 'Refresh token is invalid or expired' })
    }

    if (
      !storedRefreshToken ||
      storedRefreshToken.userId !== decoded.id ||
      storedRefreshToken.revokedAt ||
      storedRefreshToken.expiresAt <= now ||
      storedRefreshToken.user.deletedAt ||
      !storedRefreshToken.user.isActive
    ) {
      return result.withStatus(401, { message: 'Refresh token is invalid or expired' })
    }

    const session = await issueAuthSession(storedRefreshToken.user, result, context, refreshToken, { setRefreshCookie })

    const responseBody = {
      message: 'Token refreshed successfully',
      user: buildAuthUser(storedRefreshToken.user)
    }

    if (includeRefreshToken) {
      responseBody.token = session.accessToken
      responseBody.accessToken = session.accessToken
      responseBody.refreshToken = session.refreshToken
    }

    result.ok(responseBody)
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    result.withStatus(401, { message: 'Refresh token is invalid or expired' })
  }
}

/**
 * Rotates a web refresh-token cookie and returns a new access token.
 * @param {Record<string, any> & { cookies?: { refreshToken?: string }, get: (name: string) => string | undefined }} context - Refresh request context.
 * @param {import('../utils/serviceResult').ServiceResponder} [result] - Service result responder.
 * @returns {Promise<import('../utils/serviceResult').ServiceResult | void>} Service result.
 */
const refresh = async (context, result = createServiceResponder()) => {
  if (isMobileClient(context)) {
    return result.withStatus(400, { message: 'Use /auth/refresh/mobile for mobile clients.' })
  }

  return refreshSession(context, result, context.cookies?.refreshToken)
}

/**
 * Handles refresh mobile business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const refreshMobile = async (context, result) => refreshSession(
  context,
  result,
  context.body?.refreshToken,
  { includeRefreshToken: true, setRefreshCookie: false }
)

/**
 * Handles logout business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const logout = async (context, result = createServiceResponder()) => {
  const startedAt = Date.now()

  const refreshToken = context.cookies?.refreshToken
  try {
    await revokeAccessTokenFromRequest(context, { throwOnFailure: true })
  } catch (error) {
    logger.warn('Logout blocked because access token revocation failed', {
      message: error.message,
      userId: context.user?.id
    })
    await waitForMinimumDuration(startedAt, LOGOUT_MIN_RESPONSE_MS)
    return result.withStatus(503, REVOCATION_UNAVAILABLE_RESPONSE)
  }

  if (!refreshToken) {
    result.expireCookie('refreshToken', {
      ...getRefreshCookieOptions(context),
      expires: new Date(0)
    })
    clearAccessCookie(result, context)
    clearCsrfCookie(result, context)

    if (context.user?.id) {
      await recordAuditLog({
        actorId: context.user.id,
        actorRole: context.user.role,
        action: 'AUTH_LOGOUT',
        entityType: 'AuthSession',
        metadata: {
          ipAddress: getRequestIpAddress(context),
          userAgent: getRequestUserAgent(context)
        }
      })
    }

    await waitForMinimumDuration(startedAt, LOGOUT_MIN_RESPONSE_MS)
    return result.ok({ message: 'Logged out successfully' })
  }

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash: hashToken(refreshToken),
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  })

  result.expireCookie('refreshToken', {
    ...getRefreshCookieOptions(context),
    expires: new Date(0)
  })
  clearAccessCookie(result, context)
  clearCsrfCookie(result, context)

  if (context.user?.id) {
    await recordAuditLog({
      actorId: context.user.id,
      actorRole: context.user.role,
      action: 'AUTH_LOGOUT',
      entityType: 'AuthSession',
      metadata: {
        ipAddress: getRequestIpAddress(context),
        userAgent: getRequestUserAgent(context)
      }
    })
  }

  await waitForMinimumDuration(startedAt, LOGOUT_MIN_RESPONSE_MS)
  result.ok({ message: 'Logged out successfully' })
}


/**
 * Handles logout all business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const logoutAll = async (context, result = createServiceResponder()) => {
  try {
    await revokeAccessTokenFromRequest(context, { throwOnFailure: true })
    await revokeAllAccessTokensForUser(context.user.id, { throwOnFailure: true })
  } catch (error) {
    logger.warn('Logout-all blocked because access token revocation failed', {
      message: error.message,
      userId: context.user?.id
    })
    return result.withStatus(503, REVOCATION_UNAVAILABLE_RESPONSE)
  }

  await prisma.refreshToken.updateMany({
    where: {
      userId: context.user.id,
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  })

  result.expireCookie('refreshToken', {
    ...getRefreshCookieOptions(context),
    expires: new Date(0)
  })
  clearAccessCookie(result, context)
  clearCsrfCookie(result, context)

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'AUTH_LOGOUT_ALL_DEVICES',
    entityType: 'AuthSession',
    metadata: {
      ipAddress: getRequestIpAddress(context),
      userAgent: getRequestUserAgent(context)
    }
  })

  result.ok({ message: 'Signed out from all devices successfully' })
}


module.exports = {
  login,
  refresh,
  refreshMobile,
  logout,
  logoutAll
}

