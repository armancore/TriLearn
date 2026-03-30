const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())

// Routes
const authRoutes = require('./routes/auth.routes')
const adminRoutes = require('./routes/admin.routes')
const subjectRoutes = require('./routes/subject.routes')
const attendanceRoutes = require('./routes/attendance.routes')
const assignmentRoutes = require('./routes/assignment.routes')
const noticeRoutes = require('./routes/notice.routes')
const marksRoutes = require('./routes/marks.routes')
const studyMaterialRoutes = require('./routes/studyMaterial.routes')

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/subjects', subjectRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/assignments', assignmentRoutes)
app.use('/api/notices', noticeRoutes)
app.use('/api/marks', marksRoutes)
app.use('/api/materials', studyMaterialRoutes)

app.get('/', (req, res) => {
  res.json({ message: 'EduNexus backend is running! 🚀' })
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`EduNexus server running on port ${PORT}`)
})