const { errorInfo } = require('./errorInfo')
const logger = require('./logger')

/**
 * @type {typeof import("@sentry/node") | null | undefined}
 */
let sentry = null
let initialized = false

const parseSampleRate = (/** @type {string | undefined} */ value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback
}

const getEnvironment = () => process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'

const sanitizeExtra = (/** @type {unknown} */ value) => JSON.parse(JSON.stringify(value || {}, (_key, nestedValue) => {
  if (nestedValue instanceof Error) {
    return {
      message: nestedValue.message,
      stack: nestedValue.stack
    }
  }

  return nestedValue
}))

const initMonitoring = () => {
  const dsn = String(process.env.SENTRY_DSN || '').trim()

  if (!dsn || initialized) {
    return { enabled: Boolean(sentry), sentry }
  }

  try {
    sentry = require('@sentry/node')
    sentry.init({
      dsn,
      environment: getEnvironment(),
      release: process.env.SENTRY_RELEASE || undefined,
      tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0),
      sendDefaultPii: false
    })
    initialized = true
    logger.info('Sentry monitoring enabled', { environment: getEnvironment() })
  } catch (error) {
    sentry = null
    logger.warn('Sentry monitoring requested but could not be initialized', {
      message: errorInfo(error).message
    })
  }

  return { enabled: Boolean(sentry), sentry }
}

/** @param {unknown} error @param {{level?: import("@sentry/node").SeverityLevel, tags?: Record<string, unknown>, user?: import("@sentry/node").User, extra?: Record<string, unknown>}} [context] */
const captureException = (error, context = {}) => {
  if (!sentry) {
    return null
  }

  const client = sentry
  return client.withScope((scope) => {
    if (context.level) {
      scope.setLevel(context.level)
    }

    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          scope.setTag(key, String(value))
        }
      })
    }

    if (context.user) {
      scope.setUser(context.user)
    }

    if (context.extra) {
      scope.setExtras(sanitizeExtra(context.extra))
    }

    return client.captureException(error)
  })
}

const captureRequestException = (/** @type {unknown} */ error, /** @type {import("express").Request} */ req) => captureException(error, {
  tags: {
    requestId: req?.id,
    method: req?.method,
    route: req?.originalUrl
  },
  user: req?.user?.id ? { id: req.user.id, role: req.user.role } : undefined,
  extra: {
    ip: req?.ip,
    mobileAppVersion: req?.mobileAppVersion
  }
})

const flushMonitoring = async (timeoutMs = 2000) => {
  if (!sentry?.flush) {
    return false
  }

  return sentry.flush(timeoutMs)
}

module.exports = {
  initMonitoring,
  captureException,
  captureRequestException,
  flushMonitoring,
  parseSampleRate
}
