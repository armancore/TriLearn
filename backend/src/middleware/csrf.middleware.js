const { URL } = require('url')

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

const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    return next()
  }

  const hasCookieHeader = Boolean(req.headers.cookie)
  const hasBrowserContext = Boolean(req.headers.origin || req.headers.referer)

  // Bearer-token API clients without ambient browser credentials are not exposed to CSRF.
  if (!hasCookieHeader && !hasBrowserContext) {
    return next()
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
  isTrustedOrigin
}
