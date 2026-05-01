const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')
const express = require('express')
const request = require('supertest')

const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)

const loadWithMocks = (targetPath, mocks) => {
  const modulePath = path.resolve(targetPath)
  const localRequire = createRequire(modulePath)
  const touched = []

  for (const [requestPath, mockExports] of Object.entries(mocks)) {
    const resolved = localRequire.resolve(requestPath)
    touched.push({
      resolved,
      previous: require.cache[resolved]
    })
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: mockExports
    }
  }

  delete require.cache[modulePath]

  try {
    return require(modulePath)
  } finally {
    delete require.cache[modulePath]
    touched.forEach(({ resolved, previous }) => {
      if (previous) {
        require.cache[resolved] = previous
      } else {
        delete require.cache[resolved]
      }
    })
  }
}

test('attendance QR route flow generates QR, records attendance, and blocks duplicate scan', async () => {
  let capturedQrPayload = null
  const attendanceByKey = new Map()
  const dayStart = new Date('2026-04-19T00:00:00.000Z')

  const mockShared = {
    QR_VALIDITY_MINUTES: 15,
    prisma: {
      subject: {
        findUnique: async ({ where }) => {
          if (where?.id !== 'subject-1') return null
          return {
            id: 'subject-1',
            name: 'Database Systems',
            code: 'DBS101',
            instructorId: 'instructor-1'
          }
        }
      },
      subjectEnrollment: {
        findUnique: async ({ where }) => {
          const id = where?.subjectId_studentId
          if (id?.subjectId === 'subject-1' && id?.studentId === 'student-1') {
            return { id: 'enroll-1', subjectId: 'subject-1', studentId: 'student-1' }
          }
          return null
        }
      },
      attendance: {
        findUnique: async ({ where }) => {
          const composite = where?.studentId_subjectId_date
          const key = `${composite?.studentId}:${composite?.subjectId}:${new Date(composite?.date).toISOString()}`
          return attendanceByKey.get(key) || null
        },
        create: async ({ data }) => {
          const key = `${data.studentId}:${data.subjectId}:${new Date(data.date).toISOString()}`
          const attendance = {
            id: `attendance-${attendanceByKey.size + 1}`,
            ...data,
            subject: { name: 'Database Systems', code: 'DBS101' },
            student: { user: { name: 'Student One' } }
          }
          attendanceByKey.set(key, attendance)
          return attendance
        }
      }
    },
    getDayRange: () => ({
      start: dayStart,
      end: new Date('2026-04-20T00:00:00.000Z')
    }),
    getOwnedSubject: async (subjectId, req) => {
      if (subjectId !== 'subject-1') {
        return { error: { status: 404, message: 'Subject not found' } }
      }
      if (req.user.role !== 'INSTRUCTOR') {
        return { error: { status: 403, message: 'Forbidden' } }
      }
      return {
        subject: {
          id: 'subject-1',
          name: 'Database Systems',
          code: 'DBS101',
          instructorId: 'instructor-1'
        },
        instructor: { id: 'instructor-1' }
      }
    },
    createSignedQrPayload: (payload) => JSON.stringify(payload),
    parseQrPayload: (qrData) => {
      try {
        return JSON.parse(qrData)
      } catch {
        return null
      }
    },
    hashQrPayload: (qrData) => `hash:${qrData}`,
    getDailyGateWindows: async () => ({ active: [], holiday: null, dayRange: { start: dayStart } }),
    normalizeSemesterList: (values = []) => values,
    getEligibleGateAttendanceForStudent: async () => ({ error: { status: 400, message: 'unused' } }),
    upsertPresentAttendanceForRoutines: async () => ({ error: { status: 400, message: 'unused' } }),
    getStudentByIdCardQr: async () => ({ error: { status: 400, message: 'unused' } }),
    recordAuditLog: async () => {}
  }

  const qrController = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'qr.controller.js'), {
    './shared': mockShared,
    qrcode: {
      toDataURL: async (payload) => {
        capturedQrPayload = payload
        return 'data:image/png;base64,mock-qr'
      }
    }
  })

  const attendanceRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'attendance.routes.js'), {
    '../middleware/auth.middleware': {
      protect: (req, res, next) => {
        const token = String(req.headers.authorization || '').replace('Bearer ', '')
        if (token === 'instructor-token') {
          req.user = {
            id: 'user-instructor-1',
            role: 'INSTRUCTOR',
            instructor: { id: 'instructor-1' }
          }
          req.instructor = { id: 'instructor-1' }
          return next()
        }

        if (token === 'student-token') {
          req.user = {
            id: 'user-student-1',
            role: 'STUDENT',
            student: { id: 'student-1' }
          }
          req.student = { id: 'student-1' }
          return next()
        }

        return res.status(401).json({ message: 'Unauthorized' })
      },
      allowRoles: (...roles) => (req, res, next) => (
        roles.includes(req.user.role)
          ? next()
          : res.status(403).json({ message: `Access denied. Only ${roles.join(', ')} can do this.` })
      )
    },
    '../middleware/profile.middleware': {
      attachActorProfiles: (req, _res, next) => {
        if (req.user?.role === 'INSTRUCTOR') req.instructor = req.user.instructor
        if (req.user?.role === 'STUDENT') req.student = req.user.student
        next()
      }
    },
    '../middleware/rateLimit.middleware': {
      studentQrScanLimiter: (_req, _res, next) => next(),
      dailyQrScanLimiter: (_req, _res, next) => next(),
      staffStudentIdScanLimiter: (_req, _res, next) => next()
    },
    '../middleware/validate.middleware': {
      validate: () => (_req, _res, next) => next()
    },
    '../controllers/attendance/attendance.controller': {
      markAttendanceManual: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getAttendanceBySubject: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getBulkAttendanceSummary: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMyAttendance: async (_req, res) => res.status(501).json({ message: 'unused' }),
      exportMyAttendancePdf: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getSubjectRoster: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getCoordinatorDepartmentAttendanceReport: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMonthlyAttendanceReport: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../controllers/attendance/export.controller': {
      exportCoordinatorDepartmentAttendanceReport: async (_req, res) => res.status(501).json({ message: 'unused' }),
      exportAttendanceBySubject: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../controllers/attendance/qr.controller': qrController,
    '../controllers/attendance/settings.controller': {
      getGateAttendanceSettings: async (_req, res) => res.status(501).json({ message: 'unused' }),
      createGateScanWindow: async (_req, res) => res.status(501).json({ message: 'unused' }),
      updateGateScanWindow: async (_req, res) => res.status(501).json({ message: 'unused' }),
      deleteGateScanWindow: async (_req, res) => res.status(501).json({ message: 'unused' }),
      createAttendanceHoliday: async (_req, res) => res.status(501).json({ message: 'unused' }),
      deleteAttendanceHoliday: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../controllers/attendance/tickets.controller': {
      getMyAbsenceTickets: async (_req, res) => res.status(501).json({ message: 'unused' }),
      createAbsenceTicket: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getAbsenceTicketsForStaff: async (_req, res) => res.status(501).json({ message: 'unused' }),
      reviewAbsenceTicket: async (_req, res) => res.status(501).json({ message: 'unused' })
    }
  })

  const app = express()
  app.use(express.json())
  app.use('/api/v1/attendance', attendanceRoutes)

  const generateResponse = await request(app)
    .post('/api/v1/attendance/generate-qr')
    .set('Authorization', 'Bearer instructor-token')
    .send({ subjectId: 'subject-1' })

  assert.equal(generateResponse.status, 200)
  assert.equal(generateResponse.body.message, 'QR Code generated successfully!')
  assert.equal(typeof capturedQrPayload, 'string')

  const firstScanResponse = await request(app)
    .post('/api/v1/attendance/scan-qr')
    .set('Authorization', 'Bearer student-token')
    .send({ qrData: capturedQrPayload })

  assert.equal(firstScanResponse.status, 201)
  assert.equal(firstScanResponse.body.message, 'Attendance marked successfully!')
  assert.equal(attendanceByKey.size, 1)

  const duplicateScanResponse = await request(app)
    .post('/api/v1/attendance/scan-qr')
    .set('Authorization', 'Bearer student-token')
    .send({ qrData: capturedQrPayload })

  assert.equal(duplicateScanResponse.status, 409)
  assert.deepEqual(duplicateScanResponse.body, {
    message: 'Attendance has already been recorded for this subject today.'
  })
  assert.equal(attendanceByKey.size, 1)
})
