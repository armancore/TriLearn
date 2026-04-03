const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const dotenv = require('dotenv')
const logger = require('./utils/logger')
const validateEnv = require('./utils/validateEnv')
const { apiLimiter } = require('./middleware/rateLimit.middleware')
const { requestId } = require('./middleware/requestId.middleware')
const { uploadPath, uploadPublicPath } = require('./utils/fileStorage')
const { csrfProtection, getRuntimeEnv, getTrustedOrigins } = require('./middleware/csrf.middleware')
const prisma = require('./utils/prisma')
const { scheduleMaintenance } = require('./utils/maintenance')

dotenv.config()
validateEnv()

const app = express()
const runtimeEnv = getRuntimeEnv()
const isDevelopment = runtimeEnv === 'development'
const allowedOrigins = getTrustedOrigins()

app.use(requestId)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true
}))
app.use(cookieParser())
app.use(express.json())
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

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/subjects', subjectRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/assignments', assignmentRoutes)
app.use('/api/notices', noticeRoutes)
app.use('/api/marks', marksRoutes)
app.use('/api/materials', studyMaterialRoutes)
app.use('/api/routines', routineRoutes)
app.use('/api/departments', departmentRoutes)
app.use('/api/notifications', notificationRoutes)

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
  res.json({ message: 'EduNexus backend is running! 🚀' })
})

app.use((error, req, res, _next) => {
  const errorMessage = error instanceof Error ? error.message : String(error)
  ;(req.logger || logger).error(errorMessage, { stack: error?.stack })
  res.status(400).json({
    message: isDevelopment
      ? (errorMessage || 'Something went wrong')
      : 'Request failed'
  })
})

const PORT = process.env.PORT || 5000
const maintenance = scheduleMaintenance(prisma)

const server = app.listen(PORT, () => {
  logger.info('EduNexus server running', { port: PORT })
})

let isShuttingDown = false

const shutdown = async (signal) => {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  logger.info('Received shutdown signal', { signal })
  maintenance.stop()

  server.close(async () => {
    try {
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
