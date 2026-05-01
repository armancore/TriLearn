const crypto = require('crypto')
const logger = require('./logger')
const { sendMail } = require('./mailer')
const { emailVerificationTemplate } = require('./emailTemplates')

const EMAIL_VERIFICATION_EXPIRY_HOURS = 24

const hashEmailVerificationToken = (token) => crypto
  .createHash('sha256')
  .update(token)
  .digest('hex')

const createEmailVerificationToken = () => {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashEmailVerificationToken(token)
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000)

  return { token, tokenHash, expiresAt }
}

const buildEmailVerificationUrl = (token) => {
  const frontendUrl = String(process.env.FRONTEND_URL || '').replace(/\/$/, '')
  return `${frontendUrl}/verify-email?token=${encodeURIComponent(token)}`
}

const sendEmailVerificationEmail = async ({ email, name, token, userId }) => {
  const verificationUrl = buildEmailVerificationUrl(token)
  const { subject, html, text } = emailVerificationTemplate({ name, verificationUrl })

  try {
    await sendMail({ to: email, subject, html, text })
    return true
  } catch (error) {
    logger.error('Email verification email failed', {
      message: error.message,
      stack: error.stack,
      userId
    })
    return false
  }
}

module.exports = {
  EMAIL_VERIFICATION_EXPIRY_HOURS,
  hashEmailVerificationToken,
  createEmailVerificationToken,
  buildEmailVerificationUrl,
  sendEmailVerificationEmail
}
