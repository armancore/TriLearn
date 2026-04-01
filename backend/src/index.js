const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const dotenv = require('dotenv')
const path = require('path')
const logger = require('./utils/logger')
const { apiLimiter } = require('./middleware/rateLimit.middleware')

dotenv.config()

const app = express()

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
  allowedOrigins.push('http://localhost:5173')
}

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
  res.internalError = (error, fallbackMessage = 'Something went wrong') => {
    logger.error(error.message, { stack: error.stack })
    return res.status(500).json({
      message: process.env.NODE_ENV === 'production' ? fallbackMessage : (error.message || fallbackMessage)
    })
  }

  next()
})
app.use(apiLimiter)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

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

app.get('/', (req, res) => {
  res.json({ message: 'EduNexus backend is running! 🚀' })
})

app.use((error, _req, res, _next) => {
  logger.error(error.message, { stack: error.stack })
  res.status(400).json({
    message: process.env.NODE_ENV === 'production'
      ? 'Request failed'
      : (error.message || 'Something went wrong')
  })
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  logger.info('EduNexus server running', { port: PORT })
})
