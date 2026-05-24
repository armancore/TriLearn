const { createServiceResponder } = require('../utils/serviceResult')
const bcrypt = require('bcryptjs')
const prisma = require('../utils/prisma')
const { schemas } = require('../validators/schemas')
const { ZodError } = require('zod')
const { hashPassword } = require('../utils/security')
const { sanitizePlainText } = require('../utils/sanitize')
const { normalizeEmail, sanitizeOptionalPlainText } = require('../utils/adminHelpers')
const { hashToken } = require('../utils/token')
const { revokeAccessTokenFromRequest } = require('../utils/accessTokenRevocation')
const { buildAuthUser } = require('./session.service')
const { waitForMinimumDuration } = require('./auth.shared.service')

const STUDENT_INTAKE_MIN_RESPONSE_MS = 75
const GENERIC_ELIGIBILITY_MESSAGE = 'If this email is eligible, you will receive further instructions.'

const respondGenericEligibility = async (result, startedAt) => {
  await waitForMinimumDuration(startedAt, STUDENT_INTAKE_MIN_RESPONSE_MS)
  return result.withStatus(200, { message: GENERIC_ELIGIBILITY_MESSAGE })
}
// ================================
// REGISTER
// ================================
/**
 * Handles register business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const register = (_req, result) => result.withStatus(403, {
  message: 'Self-registration is disabled. Please apply through the student intake form.'
})

/**
 * Handles submit student intake business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const submitStudentIntake = async (context, result = createServiceResponder()) => {
  const startedAt = Date.now()

  try {
    const parsedBody = schemas.auth.studentIntake.body.parse(context.body)
    const {
      fullName,
      email,
      phone,
      fatherName,
      motherName,
      fatherPhone,
      motherPhone,
      bloodGroup,
      localGuardianName,
      localGuardianAddress,
      localGuardianPhone,
      permanentAddress,
      temporaryAddress,
      dateOfBirth,
      preferredDepartment
    } = parsedBody

    const normalizedEmail = normalizeEmail(email)
    const sanitizedApplication = {
      fullName: sanitizePlainText(fullName),
      phone: sanitizePlainText(phone),
      fatherName: sanitizePlainText(fatherName),
      motherName: sanitizePlainText(motherName),
      fatherPhone: sanitizePlainText(fatherPhone),
      motherPhone: sanitizePlainText(motherPhone),
      bloodGroup: sanitizeOptionalPlainText(bloodGroup),
      localGuardianName: sanitizePlainText(localGuardianName),
      localGuardianAddress: sanitizePlainText(localGuardianAddress),
      localGuardianPhone: sanitizePlainText(localGuardianPhone),
      permanentAddress: sanitizePlainText(permanentAddress),
      temporaryAddress: sanitizePlainText(temporaryAddress),
      preferredDepartment: sanitizePlainText(preferredDepartment)
    }

    const existingApplication = await prisma.studentApplication.findUnique({ where: { email: normalizedEmail } })

    if (existingApplication && !['CONVERTED', 'REVIEWED'].includes(existingApplication.status)) {
      return respondGenericEligibility(result, startedAt)
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { deletedAt: true }
    })

    if (existingUser && !existingUser.deletedAt) {
      return respondGenericEligibility(result, startedAt)
    }

    await prisma.studentApplication.upsert({
      where: { email: normalizedEmail },
      update: {
        ...sanitizedApplication,
        dateOfBirth,
        preferredSemester: 1,
        preferredSection: null,
        status: 'PENDING',
        reviewedAt: null,
        reviewedBy: null,
        linkedUserId: null
      },
      create: {
        ...sanitizedApplication,
        email: normalizedEmail,
        dateOfBirth,
        preferredSemester: 1,
        preferredSection: null
      }
    })

    return respondGenericEligibility(result, startedAt)
  } catch (error) {
    if (error instanceof ZodError) {
      return result.withStatus(400, {
        message: 'Validation failed',
        errors: error.flatten()
      })
    }

    throw error
  }
}


// ================================
// CHANGE PASSWORD
// ================================
/**
 * Handles change password business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const changePassword = async (context, result = createServiceResponder()) => {
  try {
    const parsedBody = schemas.auth.changePassword.body.parse(context.body)
    const { currentPassword, newPassword } = parsedBody

    const user = await prisma.user.findUnique({
      where: { id: context.user.id }
    })

    if (!user) {
      return result.withStatus(404, { message: 'User not found' })
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isPasswordValid) {
      return result.withStatus(400, { message: 'Current password is incorrect' })
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password)
    if (isSamePassword) {
      return result.withStatus(400, {
        message: 'New password must be different from your current password'
      })
    }

    const hashedPassword = await hashPassword(newPassword)
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
        passwordChangedAt: new Date()
      }
    })
    await revokeAccessTokenFromRequest(context)

    result.ok({
      message: 'Password changed successfully!',
      user: buildAuthUser(updatedUser)
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return result.withStatus(400, {
        message: 'Validation failed',
        errors: error.flatten()
      })
    }

    throw error
  }
}


/**
 * Handles get activity business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const getActivity = async (context, result = createServiceResponder()) => {
  const currentRefreshToken = context.cookies?.refreshToken
  const currentTokenHash = currentRefreshToken ? hashToken(currentRefreshToken) : null
  const now = new Date()

  const [activity, currentSession, sessions] = await Promise.all([
    prisma.auditLog.findMany({
      where: { actorId: context.user.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    }),
    currentTokenHash
      ? prisma.refreshToken.findFirst({
        where: {
          userId: context.user.id,
          tokenHash: currentTokenHash,
          revokedAt: null,
          expiresAt: { gt: now }
        },
        select: {
          id: true
        }
      })
      : null,
    prisma.refreshToken.findMany({
      where: {
        userId: context.user.id,
        revokedAt: null,
        expiresAt: { gt: now }
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true
      }
    })
  ])

  result.ok({
    activity: activity.map((item) => ({
      id: item.id,
      action: item.action,
      entityType: item.entityType,
      metadata: item.metadata,
      createdAt: item.createdAt
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      current: currentSession ? session.id === currentSession.id : false
    }))
  })
}


module.exports = {
  register,
  submitStudentIntake,
  changePassword,
  getActivity
}

