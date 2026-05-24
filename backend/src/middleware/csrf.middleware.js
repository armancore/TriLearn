const { URL } = require('url')
const { hasMobileClientHeaders } = require('./mobileClient.middleware')

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const getRuntimeEnv = () => process.env.NODE_ENV || 'production'

const isLocalDevelopmentOrigin = (origin) => {
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

const isTrustedOrigin = (origin) => {
  if (!origin) {
    return false
  }

  const trustedOrigins = getTrustedOrigins()

  if (trustedOrigins.includes(origin)) {
    return true
  }

  return getRuntimeEnv() !== 'production' && isLocalDevelopmentOrigin(origin)
}

const resolveRequestOrigin = (req) => {
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

const isNativeAppOrigin = (origin) => {
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

const isMobileAuthRequest = (req) => {
  const path = req.originalUrl || req.url || ''
  return (
    req.method === 'POST' &&
    (
      path === '/api/v1/auth/login' ||
      path === '/api/v1/auth/refresh/mobile' ||
      path.endsWith('/auth/login') ||
      path.endsWith('/auth/refresh/mobile')
    )
  )
}

const csrfProtection = (req, res, next) => {
  /*
   * This API uses Origin/Referer validation instead of a synchronizer token because
   * browser requests with cookie credentials already include a browser-controlled
   * origin signal that can be checked against the configured frontend origins. The
   * threat model is browser-initiated cross-site requests where an attacker site can
   * cause the browser to send ambient cookies to this API but cannot choose a trusted
   * Origin header for a cross-origin fetch. Native mobile clients are exempt only
   * when ambient browser credentials are absent; mobile headers are client metadata,
   * not proof of identity.
   */
  if (SAFE_METHODS.has(req.method)) {
    return next()
  }

  const hasCookieHeader = Boolean(req.headers.cookie)
  const hasBrowserContext = Boolean(req.headers.origin || req.headers.referer)
  const hasBearerToken = req.headers.authorization?.startsWith('Bearer ') === true
  const requestOrigin = resolveRequestOrigin(req)
  const isMobileClient = hasMobileClientHeaders(req)
  const hasNativeAppOrigin = isNativeAppOrigin(requestOrigin)

  if (isMobileClient && isMobileAuthRequest(req) && !hasCookieHeader) {
    return next()
  }

  // Native/API bearer requests use explicit tokens. They skip CSRF only when
  // ambient browser cookies are absent and the request has no browser origin
  // signal, or when Expo supplies its native exp:// origin.
  if (
    hasBearerToken &&
    !hasCookieHeader &&
    (!hasBrowserContext || (isMobileClient && hasNativeAppOrigin))
  ) {
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

  next()
}

module.exports = {
  csrfProtection,
  getRuntimeEnv,
  getTrustedOrigins,
  isMobileAuthRequest,
  isTrustedOrigin
}
