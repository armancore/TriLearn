const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')

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

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        role: true,
        isActive: true,
        deletedAt: true,
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
            department: true
          }
        },
        coordinator: {
          select: {
            id: true,
            department: true
          }
        }
      }
    })

    if (!user || user.deletedAt || !user.isActive) {
      return res.status(401).json({ message: 'User is not authorized' })
    }

    req.user = user
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
