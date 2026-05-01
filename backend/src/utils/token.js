const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m'
const REFRESH_TOKEN_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7', 10)

const getAccessSecret = () => {
  const accessSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET
  if (!accessSecret) {
    throw new Error('JWT_ACCESS_SECRET must be configured')
  }

  return accessSecret
}

const getRefreshSecret = () => {
  if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET must be configured')
  }

  return process.env.JWT_REFRESH_SECRET
}

const signAccessToken = (user) => jwt.sign(
  { id: user.id, role: user.role, type: 'access' },
  getAccessSecret(),
  { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
)

const signRefreshToken = (user) => jwt.sign(
  {
    id: user.id,
    role: user.role,
    type: 'refresh',
    jti: crypto.randomUUID()
  },
  getRefreshSecret(),
  { expiresIn: `${REFRESH_TOKEN_EXPIRES_DAYS}d` }
)

const verifyRefreshToken = (token) => jwt.verify(token, getRefreshSecret())

const hashToken = (token) => crypto
  .createHash('sha256')
  .update(token)
  .digest('hex')

const getRefreshTokenExpiry = () => {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS)
  return expiresAt
}

const getRequestHost = (req) => String(req?.hostname || req?.headers?.host || '')
  .split(':')[0]
  .trim()
  .toLowerCase()

const isPrivateIpv4Host = (host) => {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return false
  }

  const octets = host.split('.').map((part) => Number.parseInt(part, 10))
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [first, second] = octets
  return (
    first === 10 ||
    first === 127 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  )
}

const isPrivateIpv6Host = (host) => {
  if (!host.includes(':')) {
    return false
  }

  const normalizedHost = host.toLowerCase()

  return (
    normalizedHost === '::1' ||
    normalizedHost.startsWith('fc') ||
    normalizedHost.startsWith('fd') ||
    normalizedHost.startsWith('fe80:')
  )
}

const isLocalHost = (host) => (
  host === 'localhost' ||
  host.endsWith('.local') ||
  isPrivateIpv4Host(host) ||
  isPrivateIpv6Host(host)
)

const isSecureRequest = (req) => {
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()

  return req?.secure === true || forwardedProto === 'https'
}

const getRefreshCookieOptions = (req) => {
  const secure = isSecureRequest(req) || !isLocalHost(getRequestHost(req))

  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/api/v1/auth',
    expires: getRefreshTokenExpiry()
  }
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
  getRefreshCookieOptions
}
