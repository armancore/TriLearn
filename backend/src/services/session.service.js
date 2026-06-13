const prisma = require('../utils/prisma')
const { getInstructorDepartments } = require('../utils/instructorDepartments')
const {
  signAccessToken,
  signRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
  getRefreshCookieOptions
} = require('../utils/token')
const { trackAccessToken } = require('../utils/accessTokenRevocation')
const { attachCsrfCookie } = require('../middleware/csrf.middleware')

const buildAuthUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatar: user.avatar || null,
  role: user.role,
  emailVerified: !!user.emailVerified,
  mustChangePassword: !!user.mustChangePassword,
  profileCompleted: !!user.profileCompleted,
  ...(user.student ? { student: user.student } : {}),
  ...(user.instructor ? (() => {
    const instructor = { ...user.instructor }
    delete instructor.departmentMemberships

    return {
      instructor: {
        ...instructor,
        departments: getInstructorDepartments(user.instructor)
      }
    }
  })() : {}),
  ...(user.coordinator ? { coordinator: user.coordinator } : {})
})

const getRequestUserAgent = (req) => String(req.get('user-agent') || '').slice(0, 255) || null

const getRequestIpAddress = (req) => {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64) || null
}

const issueAuthSession = async (user, res, req, previousRefreshToken, { setRefreshCookie = true } = {}) => {
  const accessToken = signAccessToken(user)
  const refreshToken = signRefreshToken(user)
  const refreshTokenExpiresAt = getRefreshTokenExpiry()
  const requestMeta = {
    ipAddress: getRequestIpAddress(req),
    userAgent: getRequestUserAgent(req),
    lastUsedAt: new Date()
  }

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
        expiresAt: refreshTokenExpiresAt,
        ...requestMeta
      }
    })
  })

  if (setRefreshCookie) {
    res.setCookie('refreshToken', refreshToken, getRefreshCookieOptions(req, refreshTokenExpiresAt))
    attachCsrfCookie(res, req)
  }

  await trackAccessToken(accessToken)

  return {
    accessToken,
    refreshToken,
    expiresAt: refreshTokenExpiresAt
  }
}

module.exports = {
  issueAuthSession,
  buildAuthUser
}
