const { URL } = require('url')
const { hasValidMobileClientHeaders } = require('./mobileClient.middleware')

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const getRuntimeEnv = () => process.env.NODE_ENV || 'production'

const isLocalDevelopmentOrigin = (origin) => {
  try {
    const parsed = new URL(origin)
    const hostname = parsed.hostname

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
   * Origin header for a cross-origin fetch. Native mobile clients that authenticate
   * with Bearer tokens and a signed client identity are exempt because they do not
   * rely on ambient browser credentials, so the CSRF primitive is absent.
   */
  if (SAFE_METHODS.has(req.method)) {
    return next()
  }

  const hasCookieHeader = Boolean(req.headers.cookie)
  const hasBrowserContext = Boolean(req.headers.origin || req.headers.referer)
  const hasBearerToken = req.headers.authorization?.startsWith('Bearer ') === true
  const isMobileClient = String(req.get('x-client-type') || '').trim().toLowerCase() === 'mobile'
  const hasSignedMobileClient = hasValidMobileClientHeaders(req)

  if (hasSignedMobileClient && isMobileClient && isMobileAuthRequest(req)) {
    return next()
  }

  // Signed native mobile bearer requests use explicit tokens, but never skip CSRF
  // when browser cookies or Origin/Referer headers are present.
  if (hasSignedMobileClient && hasBearerToken && !hasCookieHeader && !hasBrowserContext) {
    return next()
  }

  // Native mobile clients do not use ambient browser cookies, so there is no
  // browser CSRF primitive even if Expo supplies an Origin-like header.
  if (hasSignedMobileClient && isMobileClient && !hasCookieHeader) {
    return next()
  }

  // Unsafe browser-like requests without Origin/Referer fail closed. Sandboxed
  // browser contexts can omit those headers, so their absence is not a safe CSRF
  // exemption signal for bearer-authenticated web endpoints.
  if (!hasCookieHeader && !hasBrowserContext) {
    return res.status(403).json({ message: 'CSRF validation failed' })
  }

  const requestOrigin = resolveRequestOrigin(req)
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
