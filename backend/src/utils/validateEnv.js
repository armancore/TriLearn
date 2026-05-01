const required = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'LOGIN_CAPTCHA_SECRET',
  'JWT_REFRESH_SECRET',
  'QR_SIGNING_SECRET',
  'FRONTEND_URL',
  'NODE_ENV'
]

const requiredProductionMail = [
  'MAIL_FROM',
  'RESEND_SMTP_HOST',
  'RESEND_SMTP_PORT',
  'RESEND_SMTP_USER',
  'RESEND_SMTP_PASS'
]
const validNodeEnvironments = new Set(['development', 'test', 'production'])
const validBooleanFlagValues = new Set(['true', 'false'])

const validateEnv = () => {
  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }

  if (!process.env.RESEND_SMTP_PASS) {
    console.warn('Warning: RESEND_SMTP_PASS not set - emails disabled')
  }

  if (!validNodeEnvironments.has(process.env.NODE_ENV)) {
    console.error(`Invalid NODE_ENV value: ${process.env.NODE_ENV}. Expected one of: development, test, production`)
    process.exit(1)
  }

  if (process.env.NODE_ENV === 'production') {
    const missingProductionMail = requiredProductionMail.filter((key) => !String(process.env[key] || '').trim())

    if (missingProductionMail.length > 0) {
      console.error(`Missing required production mail env vars: ${missingProductionMail.join(', ')}`)
      process.exit(1)
    }
  }

  if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
    console.error('Missing required env var: REDIS_URL. Production rate limiting must use Redis.')
    process.exit(1)
  }

  if (process.env.NODE_ENV === 'production' && process.env.DISABLE_RATE_LIMITS === 'true') {
    console.error('Invalid configuration: DISABLE_RATE_LIMITS=true is not allowed in production.')
    process.exit(1)
  }

  if (process.env.NODE_ENV === 'production' && process.env.DEBUG_ERRORS === 'true') {
    console.error('Invalid configuration: DEBUG_ERRORS=true is not allowed in production.')
    process.exit(1)
  }

  const enablePasswordResetFlag = process.env.ENABLE_PASSWORD_RESET
  if (
    enablePasswordResetFlag !== undefined &&
    !validBooleanFlagValues.has(String(enablePasswordResetFlag).trim())
  ) {
    console.error('Invalid configuration: ENABLE_PASSWORD_RESET must be set to "true" or "false" when provided.')
    process.exit(1)
  }

  const allowSocketNoOriginFlag = process.env.ALLOW_SOCKET_NO_ORIGIN
  if (
    allowSocketNoOriginFlag !== undefined &&
    !validBooleanFlagValues.has(String(allowSocketNoOriginFlag).trim())
  ) {
    console.error('Invalid configuration: ALLOW_SOCKET_NO_ORIGIN must be set to "true" or "false" when provided.')
    process.exit(1)
  }

  if (process.env.NODE_ENV === 'production' && String(allowSocketNoOriginFlag || '').trim() === 'true') {
    console.error('Invalid configuration: ALLOW_SOCKET_NO_ORIGIN=true is not allowed in production.')
    process.exit(1)
  }

  // Real-time notifications run over Socket.IO on the same backend server
  // and reuse the existing trusted frontend origin configuration.

  if (process.env.NODE_ENV === 'production' && process.env.OPEN_REGISTRATION === 'true') {
    console.warn('Warning: OPEN_REGISTRATION is deprecated and ignored. Use the student intake review flow instead.')
  }

  const configuredStudentPassword = String(process.env.DEFAULT_STUDENT_PASSWORD || '').trim()
  if (configuredStudentPassword && configuredStudentPassword.toLowerCase() === 'password') {
    console.warn('Warning: DEFAULT_STUDENT_PASSWORD is set to an insecure placeholder and will be ignored in favor of generated temporary passwords')
  }
}

module.exports = validateEnv
