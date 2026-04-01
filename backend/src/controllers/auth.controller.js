const crypto = require('crypto')
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
  role: user.role,
  mustChangePassword: !!user.mustChangePassword,
  profileCompleted: !!user.profileCompleted
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

const getResetTokenExpiry = () => {
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + 30)
  return expiresAt
}

// ================================
// REGISTER
// ================================
const register = async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body

    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'STUDENT',
        phone,
        address
      }
    })

    const student = await prisma.student.create({
      data: {
        userId: user.id,
        rollNumber: `STU${Date.now()}`,
        semester: 1
      }
    })

    await enrollStudentInMatchingSubjects({
      studentId: student.id,
      semester: student.semester,
      department: student.department
    })

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

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' })
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: user.suspensionReason
          ? `Your account is suspended. Reason: ${user.suspensionReason}`
          : 'Your account is disabled'
      })
    }

    const token = await issueAuthSession(user, res)

    res.json({
      message: user.mustChangePassword
        ? 'Login successful. Please change your password to continue.'
        : 'Login successful!',
      token,
      user: buildAuthUser(user)
    })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET CURRENT USER
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
        createdAt: true,
        mustChangePassword: true,
        profileCompleted: true,
        student: {
          select: {
            rollNumber: true,
            semester: true,
            section: true,
            department: true,
            guardianName: true,
            guardianPhone: true,
            dateOfBirth: true
          }
        }
      }
    })

    res.json({ user })
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    res.status(500).json({ message: 'Something went wrong' })
  }
}

// ================================
// CHANGE PASSWORD
// ================================
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' })
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false
      }
    })

    res.json({
      message: 'Password changed successfully!',
      user: buildAuthUser(updatedUser)
    })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// COMPLETE STUDENT PROFILE
// ================================
const completeProfile = async (req, res) => {
  try {
    if (req.user.role !== 'STUDENT') {
      return res.status(403).json({ message: 'Only students can complete this profile form' })
    }

    const {
      name,
      phone,
      address,
      guardianName,
      guardianPhone,
      dateOfBirth,
      section
    } = req.body

    const student = await prisma.student.findUnique({
      where: { userId: req.user.id }
    })

    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' })
    }

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: req.user.id },
        data: {
          name,
          phone,
          address,
          profileCompleted: true
        }
      }),
      prisma.student.update({
        where: { userId: req.user.id },
        data: {
          guardianName,
          guardianPhone,
          section,
          dateOfBirth: new Date(dateOfBirth)
        }
      })
    ])

    res.json({
      message: 'Profile submitted successfully!',
      user: buildAuthUser(updatedUser)
    })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// FORGOT PASSWORD
// ================================
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return res.json({
        message: 'If the account exists, password reset instructions have been prepared.'
      })
    }

    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenHash = hashToken(resetToken)
    const expiresAt = getResetTokenExpiry()

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: resetTokenHash,
        passwordResetExpiresAt: expiresAt
      }
    })

    logger.info('Password reset requested', {
      userId: user.id,
      email: user.email,
      deliveryStatus: 'pending_email_integration'
    })

    res.json({
      message: 'If the account exists, a password reset email will be sent when email delivery is configured.'
    })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// RESET PASSWORD
// ================================
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body
    const tokenHash = hashToken(token)

    const user = await prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: {
          gt: new Date()
        }
      }
    })

    if (!user) {
      return res.status(400).json({ message: 'Password reset link is invalid or expired' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null
      }
    })

    res.json({ message: 'Password reset successfully!' })
  } catch (error) {
    res.internalError(error)
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
            isActive: true,
            mustChangePassword: true,
            profileCompleted: true
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

module.exports = {
  register,
  login,
  getMe,
  changePassword,
  completeProfile,
  forgotPassword,
  resetPassword,
  refresh,
  logout
}
