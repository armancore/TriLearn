const bcrypt = require('bcryptjs')
const prisma = require('../utils/prisma')
const { enrollStudentInMatchingSubjects } = require('../utils/enrollment')
const logger = require('../utils/logger')
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
  getRefreshCookieOptions
} = require('../utils/token')

const buildAuthUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role
})

const issueAuthSession = async (user, res, previousRefreshToken) => {
  const accessToken = signAccessToken(user)
  const refreshToken = signRefreshToken(user)

  await prisma.$transaction(async (tx) => {
    if (previousRefreshToken) {
      await tx.refreshToken.updateMany({
        where: {
          tokenHash: hashToken(previousRefreshToken),
          revokedAt: null
        },
        data: { revokedAt: new Date() }
      })
    }

    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: getRefreshTokenExpiry()
      }
    })
  })

  res.cookie('refreshToken', refreshToken, getRefreshCookieOptions())

  return accessToken
}

// ================================
// REGISTER
// ================================
const register = async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body
    const role = 'STUDENT'

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' })
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create the user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || 'STUDENT',
        phone,
        address
      }
    })

    // Create role profile
    if (user.role === 'STUDENT') {
      const student = await prisma.student.create({
        data: {
          userId: user.id,
          rollNumber: `STU${Date.now()}`,
          semester: 1,
        }
      })

      await enrollStudentInMatchingSubjects({
        studentId: student.id,
        semester: student.semester,
        department: student.department
      })
    } else if (user.role === 'INSTRUCTOR') {
      await prisma.instructor.create({
        data: { userId: user.id }
      })
    } else if (user.role === 'ADMIN') {
      await prisma.admin.create({
        data: { userId: user.id }
      })
    }

    const token = await issueAuthSession(user, res)

    res.status(201).json({
      message: 'User registered successfully!',
      token,
      user: buildAuthUser(user)
    })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// LOGIN
// ================================
const login = async (req, res) => {
  try {
    const { email, password } = req.body

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' })
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account is disabled' })
    }

    const token = await issueAuthSession(user, res)

    res.json({
      message: 'Login successful!',
      token,
      user: buildAuthUser(user)
    })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET CURRENT USER (me)
// ================================
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        address: true,
        avatar: true,
        createdAt: true
      }
    })

    res.json({ user })

  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    res.status(500).json({ message: 'Something went wrong' })
  }
}

const refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token is required' })
    }

    const decoded = verifyRefreshToken(refreshToken)
    const storedRefreshToken = await prisma.refreshToken.findFirst({
      where: {
        tokenHash: hashToken(refreshToken),
        userId: decoded.id,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true
          }
        }
      }
    })

    if (!storedRefreshToken || !storedRefreshToken.user.isActive) {
      return res.status(401).json({ message: 'Refresh token is invalid or expired' })
    }

    const token = await issueAuthSession(storedRefreshToken.user, res, refreshToken)

    res.json({
      message: 'Token refreshed successfully',
      token,
      user: buildAuthUser(storedRefreshToken.user)
    })
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    res.status(401).json({ message: 'Refresh token is invalid or expired' })
  }
}

const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken

    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: {
          tokenHash: hashToken(refreshToken),
          revokedAt: null
        },
        data: { revokedAt: new Date() }
      })
    }

    res.clearCookie('refreshToken', {
      ...getRefreshCookieOptions(),
      expires: new Date(0)
    })

    res.json({ message: 'Logged out successfully' })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = { register, login, refresh, logout, getMe }

