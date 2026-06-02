const { createServiceResponder } = require('../utils/serviceResult')
const crypto = require('crypto')
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const { sendMail } = require('../utils/mailer')
const { passwordResetTemplate } = require('../utils/emailTemplates')
const { PASSWORD_RESET_EMAIL_JOB, notificationQueue } = require('../jobs/notificationQueue')
const {
  createEmailVerificationToken,
  hashEmailVerificationToken,
  sendEmailVerificationEmail
} = require('../utils/emailVerification')
const { hashPassword } = require('../utils/security')
const { normalizeEmail } = require('../utils/adminHelpers')
const { hashToken } = require('../utils/token')
const { waitForMinimumDuration } = require('./auth.shared.service')

const isPasswordResetEnabled = () => process.env.ENABLE_PASSWORD_RESET === 'true'
const FORGOT_PASSWORD_MIN_RESPONSE_MS = 75
const GENERIC_FORGOT_PASSWORD_MESSAGE = 'If an account with that email exists, a reset link has been sent.'

const getResetTokenExpiry = () => {
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + 30)
  return expiresAt
}

const queuePasswordResetEmail = async ({ user, subject, html, text, requestId = null }) => {
  const job = await notificationQueue.add(PASSWORD_RESET_EMAIL_JOB, {
    userId: user.id,
    to: user.email,
    subject,
    html,
    text,
    requestId
  }, {
    jobId: `password-reset:${user.id}:${Date.now()}`
  })

  if (job) {
    logger.info('Password reset email queued', {
      userId: user.id,
      email: user.email,
      jobId: job.id,
      requestId
    })
    return
  }

  await sendMail({ to: user.email, subject, html, text })
  logger.info('Password reset email sent without queue', {
    userId: user.id,
    email: user.email,
    requestId
  })
}
// ================================
// FORGOT PASSWORD
// ================================
/**
 * Starts the password reset flow without disclosing whether the email exists.
 * @param {Record<string, any> & { body?: { email?: string } }} context - Forgot-password request context.
 * @param {import('../utils/serviceResult').ServiceResponder} [result] - Service result responder.
 * @returns {Promise<import('../utils/serviceResult').ServiceResult | void>} Service result.
 */
const forgotPassword = async (context, result = createServiceResponder()) => {
  const startedAt = Date.now()

  if (!isPasswordResetEnabled()) {
    return result.withStatus(501, {
      message: 'Password reset is not available until email delivery is configured'
    })
  }

  const email = normalizeEmail(context.body?.email)

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true
    }
  })

  if (user) {
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

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
    const { subject, html, text } = passwordResetTemplate({
      name: user.name,
      resetUrl
    })

    await queuePasswordResetEmail({ user, subject, html, text, requestId: context.requestId })
  }

  await waitForMinimumDuration(startedAt, FORGOT_PASSWORD_MIN_RESPONSE_MS)
  return result.withStatus(200, {
    message: GENERIC_FORGOT_PASSWORD_MESSAGE
  })
}

/**
 * Handles verify email business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const verifyEmail = async (context, result = createServiceResponder()) => {
  const token = String(context.params?.token || '').trim()
  if (!token) {
    return result.withStatus(400, { message: 'Verification token is required' })
  }

  const tokenHash = hashEmailVerificationToken(token)
  const user = await prisma.user.findFirst({
    where: {
      emailVerificationToken: tokenHash,
      deletedAt: null
    },
    select: {
      id: true,
      emailVerified: true,
      emailVerificationExpiry: true
    }
  })

  if (!user || !user.emailVerificationExpiry || user.emailVerificationExpiry <= new Date()) {
    return result.withStatus(400, { message: 'Verification link is invalid or expired' })
  }

  if (user.emailVerified) {
    return result.withStatus(200, { message: 'Email verified successfully' })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiry: null
    }
  })

  result.withStatus(200, { message: 'Email verified successfully' })
}

/**
 * Handles resend verification business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const resendVerification = async (context, result = createServiceResponder()) => {
  const email = normalizeEmail(context.body?.email)
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      deletedAt: true
    }
  })

  if (!user || user.deletedAt || user.emailVerified) {
    return result.withStatus(200, { message: 'If this email needs verification, a new link has been sent.' })
  }

  const emailVerification = createEmailVerificationToken()
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationToken: emailVerification.tokenHash,
      emailVerificationExpiry: emailVerification.expiresAt
    }
  })

  await sendEmailVerificationEmail({
    email: user.email,
    name: user.name,
    token: emailVerification.token,
    userId: user.id
  })

  result.withStatus(200, { message: 'If this email needs verification, a new link has been sent.' })
}

// ================================
// RESET PASSWORD
// ================================
/**
 * Consumes a password reset token, updates the password, and revokes sessions.
 * @param {Record<string, any> & { body: { token: string, password: string } }} context - Reset-password request context.
 * @param {import('../utils/serviceResult').ServiceResponder} [result] - Service result responder.
 * @returns {Promise<import('../utils/serviceResult').ServiceResult | void>} Service result.
 */
const resetPassword = async (context, result = createServiceResponder()) => {
  if (!isPasswordResetEnabled()) {
    return result.withStatus(501, {
      message: 'Password reset is not available until email delivery is configured'
    })
  }

  const { token, password } = context.body
  const tokenHash = hashToken(token)

  const user = await prisma.user.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: {
        gt: new Date()
      }
    },
    select: {
      id: true
    }
  })

  if (!user) {
    return result.withStatus(400, { message: 'Password reset link is invalid or expired' })
  }

  const hashedPassword = await hashPassword(password)

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        // Clear the consumed reset token so the link cannot be reused.
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    })

    await tx.refreshToken.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() }
    })
  })

  result.ok({ message: 'Password reset successfully!' })
}


module.exports = {
  forgotPassword,
  verifyEmail,
  resendVerification,
  resetPassword
}

