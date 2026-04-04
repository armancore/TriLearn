const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'QR_SIGNING_SECRET',
  'FRONTEND_URL',
  'NODE_ENV'
]

const validateEnv = () => {
  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }

  if (!process.env.RESEND_SMTP_PASS) {
    console.warn('Warning: RESEND_SMTP_PASS not set - emails disabled')
  }

  if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
    console.warn('Warning: REDIS_URL not set - production rate limiting will use a per-instance in-memory store')
  }

  if (process.env.NODE_ENV === 'production' && process.env.OPEN_REGISTRATION === 'true') {
    console.warn('Warning: OPEN_REGISTRATION is enabled in production')
  }

  const configuredStudentPassword = String(process.env.DEFAULT_STUDENT_PASSWORD || '').trim()
  if (configuredStudentPassword && configuredStudentPassword.toLowerCase() === 'password') {
    console.warn('Warning: DEFAULT_STUDENT_PASSWORD is set to an insecure placeholder and will be ignored in favor of generated temporary passwords')
  }
}

module.exports = validateEnv
