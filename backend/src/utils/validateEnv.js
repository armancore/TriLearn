const logger = require('./logger')

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
const s3EnvVars = [
  'S3_BUCKET',
  'S3_REGION',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY'
]
const validNodeEnvironments = new Set(['development', 'test', 'production'])
const validBooleanFlagValues = new Set(['true', 'false'])
const KNOWN_PLACEHOLDER_SUBSTRINGS = [
  'change_this',
  'CHANGE_ME',
  'REPLACE_WITH',
  'change_user',
  'change_password',
  'trilearn_password',
  'trilearn_redis_password'
]
const secretMinimumLengths = {
  JWT_ACCESS_SECRET: 32,
  JWT_REFRESH_SECRET: 32,
  QR_SIGNING_SECRET: 32,
  LOGIN_CAPTCHA_SECRET: 32
}
const secretEnvVars = Object.keys(secretMinimumLengths)

const containsKnownPlaceholder = (value) => {
  const normalizedValue = String(value || '').toLowerCase()

  return KNOWN_PLACEHOLDER_SUBSTRINGS.some((placeholder) => (
    normalizedValue.includes(placeholder.toLowerCase())
  ))
}

const validateEnv = () => {
  if (!process.env.LOGIN_CAPTCHA_SECRET) {
    throw new Error('LOGIN_CAPTCHA_SECRET is required. Generate with: openssl rand -hex 32')
  }

  if (process.env.BCRYPT_SALT_ROUNDS) {
    throw new Error('BCRYPT_SALT_ROUNDS is no longer supported. Rename it to BCRYPT_ROUNDS in your .env file.')
  }

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    logger.error(`Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }

  if (!process.env.RESEND_SMTP_PASS) {
    logger.warn('Warning: RESEND_SMTP_PASS not set - emails disabled')
  }

  if (process.env.FCM_SERVER_KEY) {
    logger.warn('Warning: FCM_SERVER_KEY is ignored. Configure FCM_SERVICE_ACCOUNT_JSON for Firebase Cloud Messaging HTTP v1.')
  }

  if (String(process.env.RESEND_SMTP_PORT || '').trim() === '465') {
    logger.warn('Warning: RESEND_SMTP_PORT=465 uses SSL instead of STARTTLS. Prefer port 587 with STARTTLS unless legacy SSL is required.')
  }

  if (!validNodeEnvironments.has(process.env.NODE_ENV)) {
    logger.error(`Invalid NODE_ENV value: ${process.env.NODE_ENV}. Expected one of: development, test, production`)
    process.exit(1)
  }

  for (const key of secretEnvVars) {
    const value = String(process.env[key] || '')

    if (process.env.NODE_ENV === 'production' && containsKnownPlaceholder(value)) {
      throw new Error(`FATAL: ${key} contains a placeholder value. Generate real secrets before deploying.`)
    }

    if (value.length < secretMinimumLengths[key]) {
      logger.error(`Invalid configuration: ${key} must be at least ${secretMinimumLengths[key]} characters long.`)
      process.exit(1)
    }
  }

  if (process.env.NODE_ENV === 'production') {
    const missingProductionMail = requiredProductionMail.filter((key) => !String(process.env[key] || '').trim())

    if (missingProductionMail.length > 0) {
      logger.error(`Missing required production mail env vars: ${missingProductionMail.join(', ')}`)
      process.exit(1)
    }

    if (!process.env.ATTENDANCE_TIMEZONE) {
      logger.warn(
        'Warning: ATTENDANCE_TIMEZONE is not set. Defaulting to UTC. ' +
        'Attendance day boundaries will be wrong for Nepal (Asia/Kathmandu). ' +
        'Set ATTENDANCE_TIMEZONE=Asia/Kathmandu in your production env.'
      )
    }

    const tp = String(process.env.TRUST_PROXY || '').trim()
    if (!tp) {
      logger.warn('TRUST_PROXY is not set. If running behind a cloud load balancer, req.ip will be the proxy IP, not the client IP, breaking rate limiting. Set TRUST_PROXY=1 for single-proxy deployments.')
    }
    if (tp.toLowerCase() === 'true') {
      throw new Error('FATAL: TRUST_PROXY=true allows X-Forwarded-For spoofing. Use a numeric hop count (e.g. 1) or a specific IP/CIDR instead.')
    }
  }

  if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
    throw new Error('FATAL: REDIS_URL is required in production. Rate limiting and session scaling depend on Redis.')
  }

  if (process.env.NODE_ENV === 'production' && !String(process.env.HEALTHCHECK_KEY || '').trim()) {
    throw new Error('FATAL: HEALTHCHECK_KEY is required in production. Generate with: openssl rand -hex 32')
  }

  if (process.env.NODE_ENV === 'production' && process.env.DISABLE_RATE_LIMITS === 'true') {
    throw new Error('FATAL: DISABLE_RATE_LIMITS=true is not permitted in production. Remove this variable or set it to false.')
  }

  if (process.env.NODE_ENV === 'production' && String(process.env.DEBUG_ERRORS || '').trim().toLowerCase() === 'true') {
    throw new Error('FATAL: DEBUG_ERRORS=true exposes internal error details to clients. This must not be enabled in production.')
  }

  if (process.env.PGSSL_REJECT_UNAUTHORIZED !== undefined) {
    const pgSslRejectUnauthorized = String(process.env.PGSSL_REJECT_UNAUTHORIZED).trim().toLowerCase()

    if (!validBooleanFlagValues.has(pgSslRejectUnauthorized)) {
      logger.error('Invalid configuration: PGSSL_REJECT_UNAUTHORIZED must be set to "true" or "false" when provided.')
      process.exit(1)
    }

    if (process.env.NODE_ENV === 'production' && pgSslRejectUnauthorized === 'false') {
      throw new Error('FATAL: PGSSL_REJECT_UNAUTHORIZED=false disables PostgreSQL TLS certificate validation and is not permitted in production.')
    }
  }

  if (process.env.NODE_ENV === 'production') {
    try {
      const databaseUrl = new URL(process.env.DATABASE_URL)
      const sslMode = String(databaseUrl.searchParams.get('sslmode') || '').trim().toLowerCase()

      if (sslMode === 'no-verify') {
        throw new Error('FATAL: DATABASE_URL sslmode=no-verify disables PostgreSQL TLS certificate validation and is not permitted in production.')
      }
    } catch (error) {
      if (error instanceof TypeError) {
        logger.error('Invalid configuration: DATABASE_URL must be a valid PostgreSQL connection URL.')
        process.exit(1)
      }

      throw error
    }
  }

  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_API_DOCS === 'true') {
    logger.warn('Warning: ENABLE_API_DOCS=true is ignored in production. API docs will not be mounted.')
  }

  const enablePasswordResetFlag = process.env.ENABLE_PASSWORD_RESET
  if (
    enablePasswordResetFlag !== undefined &&
    !validBooleanFlagValues.has(String(enablePasswordResetFlag).trim())
  ) {
    logger.error('Invalid configuration: ENABLE_PASSWORD_RESET must be set to "true" or "false" when provided.')
    process.exit(1)
  }

  const allowSocketNoOriginFlag = process.env.ALLOW_SOCKET_NO_ORIGIN
  if (
    allowSocketNoOriginFlag !== undefined &&
    !validBooleanFlagValues.has(String(allowSocketNoOriginFlag).trim())
  ) {
    logger.error('Invalid configuration: ALLOW_SOCKET_NO_ORIGIN must be set to "true" or "false" when provided.')
    process.exit(1)
  }

  if (process.env.NODE_ENV === 'production' && String(allowSocketNoOriginFlag || '').trim() === 'true') {
    logger.error('Invalid configuration: ALLOW_SOCKET_NO_ORIGIN=true is not allowed in production.')
    process.exit(1)
  }

  if (process.env.NODE_ENV === 'production') {
    const missingS3EnvVars = s3EnvVars.filter((key) => !String(process.env[key] || '').trim())
    if (missingS3EnvVars.length > 0) {
      throw new Error(`FATAL: Missing S3 env vars: ${missingS3EnvVars.join(', ')}. Production uploads require private S3/R2 storage.`)
    }
  }

  // Real-time notifications run over Socket.IO on the same backend server
  // and reuse the existing trusted frontend origin configuration.

  if (process.env.NODE_ENV === 'production' && process.env.OPEN_REGISTRATION === 'true') {
    logger.warn(
      'WARNING: OPEN_REGISTRATION=true is set in production. ' +
      'This allows anyone on the internet to submit a student application. ' +
      'Ensure this is intentional and that coordinator review is active.'
    )
  }

}

module.exports = validateEnv
