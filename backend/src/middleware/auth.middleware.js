const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const { getInstructorDepartments } = require('../utils/instructorDepartments')
const { getReadyRedisClient } = require('../utils/redis')
const { REVOKED_JTI_PREFIX } = require('../constants/auth')

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

const getAccessSecret = () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET

const protect = async (req, res, next) => {
  try {
    // Tokens must be delivered via the Authorization header (Bearer ...) — we keep the JWT in memory on the frontend so we avoid cookies.
    const token = req.headers.authorization?.split(' ')[1]

    if (!token) {
      return res.status(401).json({ message: 'No token, access denied' })
    }

    const decoded = jwt.verify(token, getAccessSecret())
    if (decoded?.type !== 'access') {
      return res.status(401).json({ message: 'Invalid token type' })
    }

    if (decoded.jti) {
      const redis = await getReadyRedisClient({ context: 'access token revocation check' })
      if (redis && await redis.exists(`${REVOKED_JTI_PREFIX}${decoded.jti}`)) {
        return res.status(401).json({ message: 'Token has been revoked' })
      }
    }

    const user = await findAuthorizedUser(decoded.id)

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User is not authorized' })
    }

    if (decoded?.iat && user.passwordChangedAt) {
      const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000)
      if (decoded.iat < changedAt) {
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
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Access denied. Only ${roles.join(', ')} can do this.` 
      })
    }
    next()
  }
}

module.exports = { protect, allowRoles }
