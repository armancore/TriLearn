const http = require('http')
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line n/no-unpublished-require
  require('dotenv').config()
}
// In production, environment variables are injected by the platform (Railway, Render, Docker --env-file, etc.)

const logger = require('./utils/logger')
const { initMonitoring, captureException, captureRequestException, flushMonitoring } = require('./utils/monitoring')
const validateEnv = require('./utils/validateEnv')
const { apiLimiter } = require('./middleware/rateLimit.middleware')
const { protect } = require('./middleware/auth.middleware')
const { enforceHttps } = require('./middleware/enforceHttps.middleware')
const { requestId } = require('./middleware/requestId.middleware')
const { uploadPublicPaths } = require('./utils/fileStorage')
const { csrfProtection, getTrustedOrigins, isTrustedOrigin } = require('./middleware/csrf.middleware')
const { serveUploadedFile } = require('./controllers/upload.controller')
const prisma = require('./utils/prisma')
const { scheduleMaintenance } = require('./utils/maintenance')
const { initRealtime, closeRealtime } = require('./utils/realtime')
const { warmRedisConnection } = require('./utils/redis')
const { startNotificationWorker, closeNotificationWorker } = require('./jobs/notificationWorker')
const { notificationQueue } = require('./jobs/notificationQueue')
const { healthCheckHandler } = require('./utils/healthCheck')

validateEnv()
initMonitoring()

const app = express()
const allowedOrigins = getTrustedOrigins()
let server = null
let maintenance = null
let isShuttingDown = false

app.get('/health', healthCheckHandler)

const ENABLE_API_DOCS = process.env.ENABLE_API_DOCS === 'true'
if (ENABLE_API_DOCS && process.env.NODE_ENV !== 'production') {
  try {
    // eslint-disable-next-line n/no-unpublished-require
    const swaggerUi = require('swagger-ui-express')
    const { openApiDocument } = require('./docs/openapi')

    // Protect the JSON spec behind JWT so only authenticated users can fetch it.
    app.get('/api/docs/openapi.json', apiLimiter, protect, (_req, res) => {
      res.json(openApiDocument)
    })
    app.use('/api/docs', apiLimiter, protect, swaggerUi.serve, swaggerUi.setup(openApiDocument, {
      explorer: true,
      customSiteTitle: 'TriLearn API Docs'
    }))
    logger.info('API docs enabled at /api/docs (requires authentication)')
  } catch (error) {
    logger.warn('API docs requested but swagger-ui-express is not installed', { error: error.message })
  }
}

const shouldExposeInternalErrors = () => String(process.env.DEBUG_ERRORS || '').trim().toLowerCase() === 'true'
const getTrustProxySetting = () => {
  const configured = String(process.env.TRUST_PROXY || '').trim()
  if (!configured) {
    return 'loopback'
  }

  if (/^\d+$/.test(configured)) {
    return Number(configured)
  }

  return configured
}

const getErrorMessage = (error, fallbackMessage = 'Something went wrong') => {
  const errorMessage = error instanceof Error ? error.message : String(error)
  return shouldExposeInternalErrors() ? (errorMessage || fallbackMessage) : fallbackMessage
}

app.set('trust proxy', getTrustProxySetting())
app.use(requestId)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
  hsts: {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true
  }
}))
app.use(enforceHttps)
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})
app.use(cors({
  origin: (origin, callback) => {
    // Programmatic clients (curl, Postman, native mobile apps) may omit Origin.
    // Accepting no-origin requests is an intentional residual risk: CORS will
    // not block a third-party server-side SSRF from reaching the API, so routes
    // must continue to rely on auth, CSRF checks, and route-level authorization.
    // Browser sandboxed/opaque origins send the literal string "null", which must
    // stay rejected to avoid allowing sandboxed iframe attacks.
    if (!origin) return callback(null, true)
    if (origin === 'null') return callback(new Error('Not allowed by CORS'))
    if (isTrustedOrigin(origin)) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true
}))
app.use(cookieParser())
app.use(express.json({ limit: '1mb' }))
app.use((req, res, next) => {
  req.logger = logger.child({
    requestId: req.id,
    method: req.method,
    path: req.originalUrl
  })

  res.internalError = (error, fallbackMessage = 'Something went wrong') => {
    const errorMessage = error instanceof Error ? error.message : String(error)
    req.logger.error(errorMessage, { stack: error?.stack })
    captureRequestException(error, req)
    return res.status(500).json({
      message: getErrorMessage(error, fallbackMessage)
    })
  }

  next()
})
// lgtm[js/missing-token-validation] CSRF is enforced by Origin/Referer checks in csrfProtection.
app.use(csrfProtection)
uploadPublicPaths.forEach((publicPath) => {
  app.get(`${publicPath}/:filename`, apiLimiter, protect, serveUploadedFile)
})

// Routes
const authRoutes = require('./routes/auth.routes')
const adminRoutes = require('./routes/admin.routes')
const studentProfileRoutes = require('./routes/studentProfile.routes')
const subjectRoutes = require('./routes/subject.routes')
const attendanceRoutes = require('./routes/attendance.routes')
const assignmentRoutes = require('./routes/assignment.routes')
const taskRoutes = require('./routes/task.routes')
const noticeRoutes = require('./routes/notice.routes')
const marksRoutes = require('./routes/marks.routes')
const studyMaterialRoutes = require('./routes/studyMaterial.routes')
const routineRoutes = require('./routes/routine.routes')
const departmentRoutes = require('./routes/department.routes')
const notificationRoutes = require('./routes/notification.routes')
const instructorRoutes = require('./routes/instructor.routes')
const apiV1 = express.Router()

apiV1.use('/auth', authRoutes)
// Keep auth routes before the shared apiLimiter:
// auth endpoints enforce dedicated route-level throttles (login/reset/captcha)
// and should not be coupled to the generic fallback cap used by other domains.
apiV1.use(apiLimiter)
apiV1.use('/admin', adminRoutes)
apiV1.use('/students', studentProfileRoutes)
apiV1.use('/subjects', subjectRoutes)
apiV1.use('/attendance', attendanceRoutes)
apiV1.use('/assignments', assignmentRoutes)
apiV1.use('/tasks', taskRoutes)
apiV1.use('/notices', noticeRoutes)
apiV1.use('/marks', marksRoutes)
apiV1.use('/materials', studyMaterialRoutes)
apiV1.use('/routines', routineRoutes)
apiV1.use('/departments', departmentRoutes)
apiV1.use('/notifications', notificationRoutes)
apiV1.use('/instructor', instructorRoutes)

app.use('/api/v1', apiV1)

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

app.use((error, req, res, _next) => {
  const errorMessage = error instanceof Error ? error.message : String(error)
  ;(req.logger || logger).error(errorMessage, { stack: error?.stack })
  captureRequestException(error, req)
  res.status(500).json({
    message: getErrorMessage(error, 'Something went wrong')
  })
})

const PORT = process.env.PORT || 5000

const startServer = async () => {
  if (server) {
    return server
  }

  if (process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS !== 'true') {
    logger.warn('FORCE_HTTPS is not set to true in production. Confirm the reverse proxy forwards X-Forwarded-Proto: https before accepting traffic.')
  }

  if (process.env.NODE_ENV === 'production' && !process.env.FCM_SERVER_KEY) {
    logger.warn('FCM_SERVER_KEY is not set in production. Mobile push notifications will be disabled.')
  }

  void warmRedisConnection({ context: 'startup warmup' })
  maintenance = scheduleMaintenance(prisma)
  server = http.createServer(app)
  await initRealtime({
    server,
    allowedOrigins
  })
  startNotificationWorker()
  server.listen(PORT, () => {
    logger.info('TriLearn server running', { port: PORT })
  })

  return server
}

const shutdown = async (signal) => {
  if (isShuttingDown || !server) {
    return
  }

  isShuttingDown = true
  logger.info('Received shutdown signal', { signal })
  maintenance?.stop()

  server.close(async () => {
    try {
      await closeNotificationWorker()
      await notificationQueue.close()
      await closeRealtime()
      await prisma.$disconnect()
      await flushMonitoring()
      process.exit(0)
    } catch (error) {
      logger.error(error.message, { stack: error.stack })
      captureException(error, { tags: { phase: 'shutdown' } })
      await flushMonitoring()
      process.exit(1)
    }
  })
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

if (require.main === module) {
  startServer().catch((error) => {
    logger.error(error.message, { stack: error.stack })
    captureException(error, { tags: { phase: 'startup' } })
    process.exit(1)
  })
}

process.on('uncaughtException', (error) => {
  logger.error(error.message, { stack: error.stack })
  captureException(error, { tags: { phase: 'uncaughtException' } })
  void flushMonitoring().finally(() => process.exit(1))
})

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason))
  logger.error(error.message, { stack: error.stack })
  captureException(error, { tags: { phase: 'unhandledRejection' } })
})

module.exports = {
  app,
  startServer,
  shutdown,
  getErrorMessage,
  shouldExposeInternalErrors
}

