const crypto = require('crypto')
const { URL } = require('url')
const { hasMobileClientHeaders } = require('./mobileClient.middleware')
const { getCookieSecurity } = require('../utils/cookieSecurity')

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const CSRF_COOKIE_NAME = 'csrfToken'
const CSRF_HEADER_NAME = 'x-csrf-token'
const CSRF_TOKEN_BYTES = 32

const getRuntimeEnv = () => process.env.NODE_ENV || 'production'

const getCsrfSecret = () => {
  const secret = process.env.CSRF_SECRET
  if (!secret) {
    throw new Error('CSRF_SECRET must be configured')
  }

  return secret
}

const isLocalDevelopmentOrigin = (/** @type {string | URL} */ origin) => {
  try {
    const parsed = new URL(origin)
    const hostname = parsed.hostname

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true
    }

    return (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    )
  } catch {
    return false
  }
}

const getTrustedOrigins = () => {
  const configuredOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (getRuntimeEnv() !== 'production' && configuredOrigins.length === 0) {
    configuredOrigins.push('http://localhost:5173')
  }

  return configuredOrigins
}

const isTrustedOrigin = (/** @type {string} */ origin) => {
  if (!origin) {
    return false
  }

  const trustedOrigins = getTrustedOrigins()

  if (trustedOrigins.includes(origin)) {
    return true
  }

  return getRuntimeEnv() !== 'production' && isLocalDevelopmentOrigin(origin)
}

const resolveRequestOrigin = (/** @type {import("express").Request} */ req) => {
  const originHeader = req.headers.origin
  if (originHeader) {
    return originHeader
  }

  const refererHeader = req.headers.referer
  if (!refererHeader) {
    return null
  }

  try {
    return new URL(refererHeader).origin
  } catch {
    return null
  }
}

const isNativeAppOrigin = (/** @type {string | URL | null} */ origin) => {
  if (!origin) {
    return false
  }

  try {
    const parsed = new URL(origin)
    return parsed.protocol === 'exp:'
  } catch {
    return false
  }
}

const signCsrfNonce = (/** @type {crypto.BinaryLike} */ nonce) => crypto
  .createHmac('sha256', getCsrfSecret())
  .update(nonce)
  .digest('base64url')

const generateCsrfToken = () => {
  const nonce = crypto.randomBytes(CSRF_TOKEN_BYTES).toString('base64url')
  return `${nonce}.${signCsrfNonce(nonce)}`
}

/** @returns {import("express").CookieOptions} */
const getCsrfCookieOptions = (/** @type {import("../utils/cookieSecurity").CookieRequest} */ req) => {
  // Share the derivation used by the access/refresh cookies so the CSRF cookie's
  // Secure/SameSite attributes never drift from the auth cookies (which would
  // break cross-site auth on any non-local host).
  const secure = getCookieSecurity(req)

  return {
    httpOnly: false,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/api/v1',
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
}

const attachCsrfCookie = (/** @type {import("express").Response | import("../utils/serviceResult").ServiceResponder} */ res, /** @type {import("../utils/cookieSecurity").CookieRequest} */ req, token = generateCsrfToken()) => {
  if ('setCookie' in res) {
    res.setCookie(CSRF_COOKIE_NAME, token, getCsrfCookieOptions(req))
  } else {
    res.cookie(CSRF_COOKIE_NAME, token, getCsrfCookieOptions(req))
  }

  return token
}

const clearCsrfCookie = (/** @type {import("express").Response | import("../utils/serviceResult").ServiceResponder} */ res, /** @type {import("../utils/cookieSecurity").CookieRequest} */ req) => {
  const options = {
    ...getCsrfCookieOptions(req),
    expires: new Date(0)
  }

  if ('expireCookie' in res) {
    res.expireCookie(CSRF_COOKIE_NAME, options)
  } else {
    res.clearCookie(CSRF_COOKIE_NAME, options)
  }
}

const getSubmittedCsrfToken = (/** @type {import("express").Request} */ req) => {
  const headerValue = req.get(CSRF_HEADER_NAME)
  return Array.isArray(headerValue) ? headerValue[0] : headerValue
}

const timingSafeEqual = (/** @type {string} */ left, /** @type {string} */ right) => {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  )
}

const isValidSignedCsrfToken = (/** @type {unknown} */ token) => {
  const [nonce, signature, extra] = String(token || '').split('.')
  if (!nonce || !signature || extra !== undefined) {
    return false
  }

  return timingSafeEqual(signature, signCsrfNonce(nonce))
}

const isMobileAuthRequest = (/** @type {import("express").Request} */ req) => {
  const path = req.originalUrl || req.url || ''
  return (
    req.method === 'POST' &&
    (
      path === '/api/v1/auth/login' ||
      path === '/api/v1/auth/refresh/mobile' ||
      path === '/api/v1/auth/logout/mobile' ||
      path.endsWith('/auth/login') ||
      path.endsWith('/auth/refresh/mobile') ||
      path.endsWith('/auth/logout/mobile')
    )
  )
}

const hasMobileClientType = (/** @type {import("express").Request} */ req) => String(req.get('x-client-type') || '').trim().toLowerCase() === 'mobile'

const isCookieFreeMobileAuthRequest = (/** @type {{ hasMobileClientType: boolean, isMobileAuthRequest: boolean, hasCookieHeader: boolean, hasBrowserContext: boolean, hasNativeAppOrigin: boolean, hasBearerToken: boolean, isMobileClient: boolean }} */ context) => (
  context.hasMobileClientType &&
  context.isMobileAuthRequest &&
  !context.hasCookieHeader &&
  (
    !context.hasBrowserContext ||
    context.hasNativeAppOrigin
  )
)

const isCookieFreeExplicitBearerRequest = (/** @type {{ hasMobileClientType: boolean, isMobileAuthRequest: boolean, hasCookieHeader: boolean, hasBrowserContext: boolean, hasNativeAppOrigin: boolean, hasBearerToken: boolean, isMobileClient: boolean }} */ context) => (
  context.hasBearerToken &&
  !context.hasCookieHeader &&
  (
    (!context.hasBrowserContext && context.isMobileClient) ||
    (context.isMobileClient && context.hasNativeAppOrigin)
  )
)

const csrfProtection = (/** @type {import("express").Request} */ req, /** @type {import("express").Response} */ res, /** @type {import('express').NextFunction} */ next) => {
  /*
   * Browser requests must pass both a trusted Origin/Referer check and a signed
   * double-submit token check. Native mobile clients are exempt only when ambient
   * browser credentials are absent; mobile headers are client metadata, not proof
   * of identity.
   */
  const hasBrowserContext = Boolean(req.headers.origin || req.headers.referer)
  const requestOrigin = resolveRequestOrigin(req)

  if (SAFE_METHODS.has(req.method)) {
    if (hasBrowserContext && requestOrigin && isTrustedOrigin(requestOrigin) && !req.cookies?.[CSRF_COOKIE_NAME]) {
      req.csrfToken = attachCsrfCookie(res, req)
    }

    return next()
  }

  const hasCookieHeader = Boolean(req.headers.cookie)
  const hasBearerToken = req.headers.authorization?.startsWith('Bearer ') === true
  const context = {
    hasCookieHeader,
    hasBrowserContext,
    hasBearerToken,
    hasMobileClientType: hasMobileClientType(req),
    isMobileAuthRequest: isMobileAuthRequest(req),
    isMobileClient: hasMobileClientHeaders(req),
    hasNativeAppOrigin: isNativeAppOrigin(requestOrigin)
  }

  // Login and mobile-refresh do not rely on ambient browser cookies. Keep this
  // guard scoped to the auth endpoints so mobile metadata cannot exempt other routes.
  if (isCookieFreeMobileAuthRequest(context)) {
    return next()
  }

  // Native/API bearer requests use explicit tokens. They skip CSRF only when
  // ambient browser cookies are absent and the request has no browser origin
  // signal, or when Expo supplies its native exp:// origin.
  if (isCookieFreeExplicitBearerRequest(context)) {
    return next()
  }

  // Unsafe browser-like requests without Origin/Referer fail closed. Sandboxed
  // browser contexts can omit those headers, so their absence is not a safe CSRF
  // exemption signal for bearer-authenticated web endpoints.
  if (!hasCookieHeader && !hasBrowserContext) {
    return res.status(403).json({ message: 'CSRF validation failed' })
  }

  if (!requestOrigin || !isTrustedOrigin(requestOrigin)) {
    return res.status(403).json({ message: 'CSRF validation failed' })
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME]
  const submittedToken = getSubmittedCsrfToken(req)

  if (
    !cookieToken ||
    !submittedToken ||
    !isValidSignedCsrfToken(cookieToken) ||
    !timingSafeEqual(cookieToken, submittedToken)
  ) {
    return res.status(403).json({ message: 'CSRF validation failed' })
  }

  next()
}

module.exports = {
  attachCsrfCookie,
  clearCsrfCookie,
  csrfProtection,
  generateCsrfToken,
  getCsrfCookieOptions,
  getRuntimeEnv,
  getTrustedOrigins,
  isMobileAuthRequest,
  isTrustedOrigin
}
