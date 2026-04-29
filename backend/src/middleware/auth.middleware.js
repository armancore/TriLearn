const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const { getInstructorDepartments } = require('../utils/instructorDepartments')

const isUnknownPrismaFieldError = (error, fieldName) => {
  if (!error?.message || !fieldName) {
    return false
  }

  return error.message.includes(`Unknown field \`${fieldName}\``)
}

const isMissingDatabaseColumnError = (error, fieldName) => {
  if (!error?.message || !fieldName) {
    return false
  }

  const normalizedMessage = error.message.toLowerCase()
  const normalizedFieldName = fieldName.toLowerCase()

  return (
    normalizedMessage.includes('column') &&
    normalizedMessage.includes(normalizedFieldName) &&
    normalizedMessage.includes('does not exist')
  )
}

const shouldRetryUserLookupWithLegacyShape = (error) => (
  isUnknownPrismaFieldError(error, 'passwordChangedAt') ||
  isUnknownPrismaFieldError(error, 'deletedAt') ||
  isMissingDatabaseColumnError(error, 'passwordChangedAt') ||
  isMissingDatabaseColumnError(error, 'deletedAt')
)

const getUserSelectShape = ({ includePasswordChangedAt = true } = {}) => ({
  id: true,
  role: true,
  isActive: true,
  ...(includePasswordChangedAt ? { passwordChangedAt: true } : {}),
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

const findAuthorizedUser = async (userId) => {
  try {
    return await prisma.user.findUnique({
      where: {
        id: userId,
        deletedAt: null
      },
      select: getUserSelectShape({ includePasswordChangedAt: true })
    })
  } catch (error) {
    if (!shouldRetryUserLookupWithLegacyShape(error)) {
      throw error
    }

    logger.warn('Falling back to legacy auth user lookup shape', { userId })

    return prisma.user.findUnique({
      where: { id: userId },
      select: getUserSelectShape({ includePasswordChangedAt: false })
    })
  }
}

const protect = async (req, res, next) => {
  try {
    // Tokens must be delivered via the Authorization header (Bearer ...) — we keep the JWT in memory on the frontend so we avoid cookies.
    const token = req.headers.authorization?.split(' ')[1]

    if (!token) {
      return res.status(401).json({ message: 'No token, access denied' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded?.type !== 'access') {
      return res.status(401).json({ message: 'Invalid token type' })
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
