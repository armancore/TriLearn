const http = require('http')
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const dotenv = require('dotenv')
const helmet = require('helmet')
const logger = require('./utils/logger')
const validateEnv = require('./utils/validateEnv')
const { apiLimiter } = require('./middleware/rateLimit.middleware')
const { protect } = require('./middleware/auth.middleware')
const { requestId } = require('./middleware/requestId.middleware')
const { uploadPublicPaths } = require('./utils/fileStorage')
const { csrfProtection, getTrustedOrigins, isTrustedOrigin } = require('./middleware/csrf.middleware')
const { serveUploadedFile } = require('./controllers/upload.controller')
const { normalizeIpAddress, isPrivateIpv4, isPrivateIpv6 } = require('./utils/network')
const prisma = require('./utils/prisma')
const { scheduleMaintenance } = require('./utils/maintenance')
const { initRealtime, closeRealtime } = require('./utils/realtime')
const { warmRedisConnection } = require('./utils/redis')
const { startNotificationWorker, closeNotificationWorker } = require('./jobs/notificationWorker')
const { notificationQueue } = require('./jobs/notificationQueue')

dotenv.config()
validateEnv()

const app = express()
const allowedOrigins = getTrustedOrigins()
let server = null
let maintenance = null
let isShuttingDown = false

if (process.env.NODE_ENV !== 'production') {
  const swaggerUi = require('swagger-ui-express')
  const { openApiDocument } = require('./docs/openapi')

  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(openApiDocument)
  })
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, {
    explorer: true,
    customSiteTitle: 'TriLearn API Docs'
  }))
}

const shouldExposeInternalErrors = () => String(process.env.DEBUG_ERRORS || '').trim().toLowerCase() === 'true'
const INTERNAL_HEALTHCHECK_HEADER = 'x-health-check-key'
const getTrustProxySetting = () => {
  const configured = String(process.env.TRUST_PROXY || '').trim()
  return configured || 'loopback'
}

const getErrorMessage = (error, fallbackMessage = 'Something went wrong') => {
  const errorMessage = error instanceof Error ? error.message : String(error)
  return shouldExposeInternalErrors() ? (errorMessage || fallbackMessage) : fallbackMessage
}

const isInternalRequest = (req) => {
  const normalizedIp = normalizeIpAddress(req.ip || req.socket?.remoteAddress || '')
  return normalizedIp === 'localhost' || isPrivateIpv4(normalizedIp) || isPrivateIpv6(normalizedIp)
}

const requireInternalHealthcheck = (req, res, next) => {
  const configuredHealthcheckKey = String(process.env.HEALTHCHECK_KEY || '').trim()
  const providedHealthcheckKey = String(req.get(INTERNAL_HEALTHCHECK_HEADER) || '').trim()

  if (isInternalRequest(req)) {
    return next()
  }

  if (configuredHealthcheckKey && providedHealthcheckKey === configuredHealthcheckKey) {
    return next()
  }

  return res.status(404).json({ message: 'Route not found' })
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
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
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
    return res.status(500).json({
      message: getErrorMessage(error, fallbackMessage)
    })
  }

  next()
})
app.use(csrfProtection)
uploadPublicPaths.forEach((publicPath) => {
  app.get(`${publicPath}/:filename`, protect, serveUploadedFile)
})

// Routes
const authRoutes = require('./routes/auth.routes')
const adminRoutes = require('./routes/admin.routes')
const subjectRoutes = require('./routes/subject.routes')
const attendanceRoutes = require('./routes/attendance.routes')
const assignmentRoutes = require('./routes/assignment.routes')
const noticeRoutes = require('./routes/notice.routes')
const marksRoutes = require('./routes/marks.routes')
const studyMaterialRoutes = require('./routes/studyMaterial.routes')
const routineRoutes = require('./routes/routine.routes')
const departmentRoutes = require('./routes/department.routes')
const notificationRoutes = require('./routes/notification.routes')
const apiV1 = express.Router()

apiV1.use('/auth', authRoutes)
// Keep auth routes before the shared apiLimiter:
// auth endpoints enforce dedicated route-level throttles (login/reset/captcha)
// and should not be coupled to the generic fallback cap used by other domains.
apiV1.use(apiLimiter)
apiV1.use('/admin', adminRoutes)
apiV1.use('/subjects', subjectRoutes)
apiV1.use('/attendance', attendanceRoutes)
apiV1.use('/assignments', assignmentRoutes)
apiV1.use('/notices', noticeRoutes)
apiV1.use('/marks', marksRoutes)
apiV1.use('/materials', studyMaterialRoutes)
apiV1.use('/routines', routineRoutes)
apiV1.use('/departments', departmentRoutes)
apiV1.use('/notifications', notificationRoutes)

app.use('/api/v1', apiV1)

app.get('/health', requireInternalHealthcheck, (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/ping', requireInternalHealthcheck, (_req, res) => {
  res.json({ status: 'ok' })
})

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

app.use((error, req, res, _next) => {
  const errorMessage = error instanceof Error ? error.message : String(error)
  ;(req.logger || logger).error(errorMessage, { stack: error?.stack })
  res.status(500).json({
    message: getErrorMessage(error, 'Something went wrong')
  })
})

const PORT = process.env.PORT || 5000

const startServer = async () => {
  if (server) {
    return server
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
      process.exit(0)
    } catch (error) {
      logger.error(error.message, { stack: error.stack })
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
    process.exit(1)
  })
}

module.exports = {
  app,
  startServer,
  shutdown,
  getErrorMessage,
  shouldExposeInternalErrors
}

