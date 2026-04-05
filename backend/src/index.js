const http = require('http')
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const dotenv = require('dotenv')
const helmet = require('helmet')
const logger = require('./utils/logger')
const validateEnv = require('./utils/validateEnv')
const { apiLimiter } = require('./middleware/rateLimit.middleware')
const { requestId } = require('./middleware/requestId.middleware')
const { uploadPath, uploadPublicPath } = require('./utils/fileStorage')
const { csrfProtection, getRuntimeEnv, getTrustedOrigins } = require('./middleware/csrf.middleware')
const prisma = require('./utils/prisma')
const { scheduleMaintenance } = require('./utils/maintenance')
const { initRealtime, closeRealtime } = require('./utils/realtime')

dotenv.config()
validateEnv()

const app = express()
const runtimeEnv = getRuntimeEnv()
const isDevelopment = runtimeEnv === 'development'
const allowedOrigins = getTrustedOrigins()
let server = null
let maintenance = null
let isShuttingDown = false

app.set('trust proxy', 1)
app.use(requestId)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
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
      message: isDevelopment ? (errorMessage || fallbackMessage) : fallbackMessage
    })
  }

  next()
})
app.use(apiLimiter)
app.use(csrfProtection)
app.use(uploadPublicPath, express.static(uploadPath))

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

app.get('/health', async (_req, res) => {
  try {
    await require('./utils/prisma').$queryRaw`SELECT 1`
    res.json({
      status: 'ok',
      database: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    res.status(503).json({
      status: 'error',
      database: 'unavailable',
      timestamp: new Date().toISOString()
    })
  }
})

app.get('/ping', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/', (req, res) => {
  res.json({ message: 'TriLearn backend is running! 🚀' })
})

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

app.use((error, req, res, _next) => {
  const errorMessage = error instanceof Error ? error.message : String(error)
  ;(req.logger || logger).error(errorMessage, { stack: error?.stack })
  res.status(500).json({
    message: isDevelopment
      ? (errorMessage || 'Something went wrong')
      : 'Something went wrong'
  })
})

const PORT = process.env.PORT || 5000

const startServer = () => {
  if (server) {
    return server
  }

  maintenance = scheduleMaintenance(prisma)
  server = http.createServer(app)
  initRealtime({
    server,
    allowedOrigins
  })
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
  startServer()
}

module.exports = {
  app,
  startServer,
  shutdown
}
