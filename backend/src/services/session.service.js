const prisma = require('../utils/prisma')
const { createServiceError } = require('../utils/serviceResult')
const { getInstructorDepartments } = require('../utils/instructorDepartments')
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
  getRefreshCookieOptions,
  getAccessCookieOptions,
  ACCESS_TOKEN_COOKIE_NAME
} = require('../utils/token')
const { trackAccessToken } = require('../utils/accessTokenRevocation')
const { attachCsrfCookie } = require('../middleware/csrf.middleware')

/** @param {Pick<import("@prisma/client").User, "id" | "role" | "emailVerified" | "mustChangePassword" | "profileCompleted"> & Partial<import("@prisma/client").User> & {student?: Partial<import("@prisma/client").Student> | null, instructor?: {id: string, department: string | null, departmentMemberships?: {department: {name: string}}[]} | null, coordinator?: Partial<import("@prisma/client").Coordinator> | null}} user */
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

const getRequestUserAgent = (/** @type {ReturnType<typeof import("../utils/controllerAdapter").buildServiceContext>} */ req) => String(req.get('user-agent') || '').slice(0, 255) || null

const getRequestIpAddress = (/** @type {ReturnType<typeof import("../utils/controllerAdapter").buildServiceContext>} */ req) => {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64) || null
}

/** @param {{id: string, role: string, password?: string}} user @param {import("../utils/serviceResult").ServiceResponder} res @param {ReturnType<typeof import("../utils/controllerAdapter").buildServiceContext>} req @param {string | null | undefined} previousRefreshToken @param {{setRefreshCookie?: boolean, setAccessCookie?: boolean}} [options] */
const issueAuthSession = async (user, res, req, previousRefreshToken, { setRefreshCookie = true, setAccessCookie = setRefreshCookie } = {}) => {
  const accessToken = signAccessToken(user)
  const refreshToken = signRefreshToken(user)
  const refreshTokenExpiresAt = getRefreshTokenExpiry()
  const requestMeta = {
    ipAddress: getRequestIpAddress(req),
    userAgent: getRequestUserAgent(req),
    lastUsedAt: new Date()
  }

  await prisma.$transaction(async (tx) => {
    const currentUser = await tx.user.findUnique({ where: { id: user.id } })
    if (!currentUser?.isActive || currentUser.deletedAt ||
      (!previousRefreshToken && currentUser.password !== user.password)) {
      throw createServiceError(401, 'Session is no longer valid')
    }
    if (previousRefreshToken) {
      // Recheck inside the serializable rotation transaction so a concurrent
      // password change or logout cannot mint a replacement session.
      const previous = verifyRefreshToken(previousRefreshToken)
      if (!currentUser?.isActive || currentUser.deletedAt ||
        (currentUser.passwordChangedAt && (!Number.isFinite(previous.iat) ||
          previous.iat <= Math.floor(currentUser.passwordChangedAt.getTime() / 1000)))) {
        throw new Error('Session is no longer valid')
      }
      const consumed = await tx.refreshToken.updateMany({
        where: {
          tokenHash: hashToken(previousRefreshToken),
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() }
        },
        data: { revokedAt: new Date() }
      })
      if (consumed.count !== 1) throw createServiceError(401, 'Session is no longer valid')
    }

    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
        ...requestMeta
      }
    })
  }, { isolationLevel: 'Serializable' })

  if (setRefreshCookie) {
    res.setCookie('refreshToken', refreshToken, getRefreshCookieOptions(req, refreshTokenExpiresAt))
    attachCsrfCookie(res, req)
  }

  if (setAccessCookie) {
    res.setCookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, getAccessCookieOptions(req, accessToken))
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
