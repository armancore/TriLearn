const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const { getInstructorDepartments } = require('../utils/instructorDepartments')
const { getReadyRedisClient, isRedisConfigured } = require('../utils/redis')
const { cacheRevokedJti, isRevokedJtiCached } = require('../utils/accessTokenRevocation')
const { REVOKED_JTI_PREFIX } = require('../constants/auth')
const { ACCESS_TOKEN_COOKIE_NAME } = require('../utils/token')

const getUserSelectShape = () => ({
  id: true,
  role: true,
  isActive: true,
  passwordChangedAt: true,
  student: {
    select: {
      id: true,
      rollNumber: true,
      semester: true,
      section: true,
      department: true
    }
  },
  instructor: {
    select: {
      id: true,
      department: true,
      departmentMemberships: {
        include: {
          department: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  },
  gatekeeper: {
    select: {
      id: true,
      department: true
    }
  },
  coordinator: {
    select: {
      id: true,
      department: true
    }
  }
})

const findAuthorizedUser = async (userId) => prisma.user.findUnique({
  where: {
    id: userId,
    deletedAt: null
  },
  select: getUserSelectShape()
})

const getAccessSecret = () => {
  const accessSecret = process.env.JWT_ACCESS_SECRET
  if (!accessSecret) {
    throw new Error('JWT_ACCESS_SECRET must be configured')
  }

  return accessSecret
}

const resolveAccessToken = (req) => {
  const [scheme, bearerToken] = String(req.headers.authorization || '').split(' ')
  if (scheme?.toLowerCase() === 'bearer' && bearerToken) {
    return bearerToken
  }

  const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE_NAME]
  return typeof cookieToken === 'string' && cookieToken.trim() ? cookieToken.trim() : null
}

const protect = async (req, res, next) => {
  try {
    const token = resolveAccessToken(req)

    if (!token) {
      return res.status(401).json({ message: 'No token, access denied' })
    }

    const decoded = jwt.verify(token, getAccessSecret())
    if (decoded?.type !== 'access') {
      return res.status(401).json({ message: 'Invalid token type' })
    }

    if (decoded.jti) {
      // REDIS-SAVE: in-memory negative cache avoids Redis EXISTS on every protected request
      if (isRevokedJtiCached(decoded.jti)) {
        return res.status(401).json({ message: 'Token has been revoked' })
      }

      // Fail-closed: if Redis is configured (revocation feature is enabled) but
      // unreachable we must not silently skip the check — a revoked token would
      // stay valid for up to the 15-min access-token TTL.  Consistent with the
      // rate-limiter and QR-replay guard which also fail closed.
      const redis = await getReadyRedisClient({ context: 'access token revocation check' })
      if (!redis && isRedisConfigured()) {
        return res.status(503).json({ message: 'Service temporarily unavailable. Please try again shortly.' })
      }
      if (redis && await redis.exists(`${REVOKED_JTI_PREFIX}${decoded.jti}`)) {
        cacheRevokedJti(decoded.jti)
        return res.status(401).json({ message: 'Token has been revoked' })
      }
    }

    const user = await findAuthorizedUser(decoded.id)

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User is not authorized' })
    }

    if (decoded?.iat && user.passwordChangedAt) {
      const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000)
      if (decoded.iat <= changedAt) {
        return res.status(401).json({ message: 'Password was changed. Please log in again.' })
      }
    }

    if (user.instructor) {
      const instructor = { ...user.instructor }
      delete instructor.departmentMemberships

      req.user = {
        ...user,
        instructor: {
          ...instructor,
          departments: getInstructorDepartments(user.instructor)
        }
      }
    } else {
      req.user = user
    }
    req.accessToken = token
    req.accessTokenPayload = decoded
    next()

  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    res.status(401).json({ message: 'Invalid token' })
  }
}

const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Only ${roles.join(', ')} can do this.`
      })
    }
    next()
  }
}

module.exports = { protect, allowRoles }
