const fs = require('fs')
const path = require('path')
const winston = require('winston')

const logsDir = path.join(__dirname, '..', '..', 'logs')
const isProduction = process.env.NODE_ENV === 'production'
const REDACTED = '[REDACTED]'
const SENSITIVE_KEY_PATTERN = /(^|_)(password|token|secret|authorization|cookie|session|jwt)(_|$)|refreshToken|accessToken|idToken/i

if (!isProduction) {
  fs.mkdirSync(logsDir, { recursive: true })
}

const transports = [
  new winston.transports.Console()
]

if (!isProduction) {
  transports.push(
    new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' })
  )
}

const logger = winston.createLogger({
  level: isProduction ? 'warn' : 'debug',
  format: winston.format.combine(
    winston.format((info) => sanitizeLogMeta(info))(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports
})

function sanitizeLogMeta(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') {
    return value
  }

  if (value instanceof Error) {
    return value
  }

  if (seen.has(value)) {
    return '[Circular]'
  }

  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogMeta(item, seen))
  }

  Object.entries(value).forEach(([key, nestedValue]) => {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      value[key] = REDACTED
      return
    }

    value[key] = sanitizeLogMeta(nestedValue, seen)
  })

  return value
}

logger.sanitizeLogMeta = sanitizeLogMeta
logger.REDACTED = REDACTED

module.exports = logger
