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
  const sourceRoot = resolveFromTest('src')
  const previousCacheKeys = new Set(Object.keys(require.cache))
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
    for (const cachedPath of Object.keys(require.cache)) {
      if (!previousCacheKeys.has(cachedPath) && cachedPath.startsWith(sourceRoot)) {
        delete require.cache[cachedPath]
      }
    }

    touched.forEach(({ resolved, previous }) => {
      if (previous) {
        require.cache[resolved] = previous
      } else {
        delete require.cache[resolved]
      }
    })
  }
}

const usersByToken = {
  'admin-token': { id: 'admin-user-1', role: 'ADMIN' },
  'coordinator-token': { id: 'coordinator-user-1', role: 'COORDINATOR', coordinator: { id: 'coordinator-1', department: 'BCA' } },
  'instructor-token': { id: 'instructor-user-1', role: 'INSTRUCTOR', instructor: { id: 'instructor-1', department: 'BCA' } },
  'student-token': { id: 'student-user-1', role: 'STUDENT', student: { id: 'student-1', semester: 3, department: 'BCA' } }
}

const authMiddleware = {
  protect: (req, res, next) => {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const user = usersByToken[token]

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    req.user = user
    return next()
  },
  allowRoles: (...roles) => (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: 'Access denied' })
    }

    return next()
  }
}

const profileMiddleware = {
  attachActorProfiles: (req, _res, next) => {
    if (req.user?.student) req.student = req.user.student
    if (req.user?.instructor) req.instructor = req.user.instructor
    if (req.user?.coordinator) req.coordinator = req.user.coordinator
    next()
  }
}

const noOpValidate = {
  validate: () => (_req, _res, next) => next()
}

const noOpRateLimits = {
  authRouterLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
  loginLimiter: (_req, _res, next) => next(),
  refreshLimiter: (_req, _res, next) => next(),
  logoutLimiter: (_req, _res, next) => next(),
  forgotPasswordLimiter: (_req, _res, next) => next(),
  resendVerificationLimiter: (_req, _res, next) => next(),
  uploadLimiter: (_req, _res, next) => next(),
  staffUploadLimiter: (_req, _res, next) => next(),
  studentUploadLimiter: (_req, _res, next) => next(),
  studentQrScanLimiter: (_req, _res, next) => next(),
  dailyQrScanLimiter: (_req, _res, next) => next(),
  staffStudentIdScanLimiter: (_req, _res, next) => next()
}

const uploadMiddleware = {
  uploadPdf: {
    single: (fieldName) => (req, _res, next) => {
      req.file = {
        fieldname: fieldName,
        filename: `${fieldName}.pdf`,
        mimetype: 'application/pdf',
        url: `/api/v1/uploads/${fieldName}.pdf`
      }
      next()
    }
  },
  uploadImage: {
    single: () => (_req, _res, next) => next()
  },
  uploadSpreadsheet: {
    single: () => (_req, _res, next) => next()
  },
  validateUploadedPdf: (_req, _res, next) => next(),
  validateUploadedImage: (_req, _res, next) => next(),
  validateUploadedSpreadsheet: (_req, _res, next) => next()
}

const schemas = new Proxy({}, {
  get: () => new Proxy({}, {
    get: () => ({})
  })
})

const mountJsonRoute = (basePath, router) => {
  const app = express()
  app.use(express.json())
  app.use(basePath, router)
  return app
}

test('journey: student signs in and loads their profile', async () => {
  const authRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'auth.routes.js'), {
    '../controllers/auth.controller': {
      register: async (_req, res) => res.status(501).json({ message: 'unused' }),
      submitStudentIntake: async (_req, res) => res.status(501).json({ message: 'unused' }),
      login: async (req, res) => res.status(200).json({
        message: 'Login successful!',
        token: 'student-token',
        user: { id: 'student-user-1', role: 'STUDENT', email: req.body.email }
      }),
      refresh: async (_req, res) => res.status(501).json({ message: 'unused' }),
      refreshMobile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      logout: async (_req, res) => res.status(501).json({ message: 'unused' }),
      logoutAll: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMe: async (req, res) => res.json({ user: req.user }),
      getStudentIdQr: async (_req, res) => res.status(501).json({ message: 'unused' }),
      updateProfile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      uploadAvatar: async (_req, res) => res.status(501).json({ message: 'unused' }),
      changePassword: async (_req, res) => res.status(501).json({ message: 'unused' }),
      completeProfile: async (_req, res) => res.status(501).json({ message: 'unused' }),
      forgotPassword: async (_req, res) => res.status(501).json({ message: 'unused' }),
      verifyEmail: async (_req, res) => res.status(501).json({ message: 'unused' }),
      resendVerification: async (_req, res) => res.status(501).json({ message: 'unused' }),
      resetPassword: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getActivity: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../middleware/auth.middleware': authMiddleware,
    '../middleware/rateLimit.middleware': noOpRateLimits,
    '../middleware/upload.middleware': uploadMiddleware,
    '../middleware/validate.middleware': noOpValidate,
    '../middleware/mobileClient.middleware': { validateMobileClient: (_req, _res, next) => next() },
    '../validators/schemas': { schemas }
  })
  const app = mountJsonRoute('/api/v1/auth', authRoutes)

  const loginResponse = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'student@example.edu', password: 'Password123' })
  const profileResponse = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${loginResponse.body.token}`)

  assert.equal(loginResponse.status, 200)
  assert.equal(profileResponse.status, 200)
  assert.equal(profileResponse.body.user.role, 'STUDENT')
})

test('journey: instructor creates an attendance QR and student scan records attendance', async () => {
  const attendanceRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'attendance.routes.js'), {
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
    '../controllers/attendance/qr.controller': {
      generateDailyAttendanceQR: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getLiveGateAttendanceQr: async (_req, res) => res.status(501).json({ message: 'unused' }),
      generateQR: async (req, res) => res.status(201).json({
        qrToken: 'attendance-token-1',
        subjectId: req.body.subjectId,
        expiresAt: '2026-05-07T10:00:00.000Z'
      }),
      markAttendanceQR: async (req, res) => res.status(201).json({
        message: 'Attendance marked',
        attendance: {
          id: 'attendance-1',
          studentId: req.user.student.id,
          qrToken: req.body.qrToken
        }
      }),
      markDailyAttendanceQR: async (_req, res) => res.status(501).json({ message: 'unused' }),
      scanStudentIdAttendance: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
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
    },
    '../middleware/auth.middleware': authMiddleware,
    '../middleware/profile.middleware': profileMiddleware,
    '../middleware/rateLimit.middleware': noOpRateLimits,
    '../middleware/validate.middleware': noOpValidate,
    '../validators/schemas': { schemas }
  })
  const app = mountJsonRoute('/api/v1/attendance', attendanceRoutes)

  const qrResponse = await request(app)
    .post('/api/v1/attendance/generate-qr')
    .set('Authorization', 'Bearer instructor-token')
    .send({ subjectId: 'subject-1' })
  const scanResponse = await request(app)
    .post('/api/v1/attendance/scan-qr')
    .set('Authorization', 'Bearer student-token')
    .send({ qrToken: qrResponse.body.qrToken })

  assert.equal(qrResponse.status, 201)
  assert.equal(scanResponse.status, 201)
  assert.equal(scanResponse.body.attendance.studentId, 'student-1')
})

test('journey: instructor records marks and student views published summary', async () => {
  const marksRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'marks.routes.js'), {
    '../controllers/marks.controller': {
      addMarks: async (req, res) => res.status(201).json({
        message: 'Marks saved',
        mark: { id: 'mark-1', studentId: req.body.studentId, obtainedMarks: req.body.obtainedMarks }
      }),
      addMarksBulk: async (_req, res) => res.status(501).json({ message: 'unused' }),
      updateMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMarksBySubject: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMarksReview: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getEnrolledStudentsBySubject: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMyMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getMyMarksSummary: async (req, res) => res.json({
        studentId: req.user.student.id,
        semester: 3,
        gpa: 3.72,
        subjects: [{ subjectId: 'subject-1', grade: 'A' }]
      }),
      exportMyMarksheetPdf: async (_req, res) => res.status(501).json({ message: 'unused' }),
      deleteMarks: async (_req, res) => res.status(501).json({ message: 'unused' }),
      publishMarks: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../middleware/auth.middleware': authMiddleware,
    '../middleware/profile.middleware': profileMiddleware,
    '../middleware/validate.middleware': noOpValidate,
    '../validators/schemas': { schemas }
  })
  const app = mountJsonRoute('/api/v1/marks', marksRoutes)

  const addResponse = await request(app)
    .post('/api/v1/marks')
    .set('Authorization', 'Bearer instructor-token')
    .send({ subjectId: 'subject-1', studentId: 'student-1', obtainedMarks: 87, totalMarks: 100, examType: 'FINAL' })
  const summaryResponse = await request(app)
    .get('/api/v1/marks/my/summary?semester=3')
    .set('Authorization', 'Bearer student-token')

  assert.equal(addResponse.status, 201)
  assert.equal(addResponse.body.mark.obtainedMarks, 87)
  assert.equal(summaryResponse.status, 200)
  assert.equal(summaryResponse.body.gpa, 3.72)
})

test('journey: admin views dashboard stats and creates a student account', async () => {
  const adminRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'admin.routes.js'), {
    '../controllers/admin.controller': {
      getAdminStats: async (_req, res) => res.json({
        users: { students: 120, instructors: 12 },
        attendance: { todayPresent: 98 }
      })
    },
    '../controllers/users.controller': {
      getAllUsers: async (_req, res) => res.status(501).json({ message: 'unused' }),
      exportStudents: async (_req, res) => res.status(501).json({ message: 'unused' }),
      exportStudentIdUpdateTemplate: async (_req, res) => res.status(501).json({ message: 'unused' }),
      bulkUpdateStudentIds: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getUserById: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../controllers/studentApplications.controller': {
      getStudentApplications: async (_req, res) => res.status(501).json({ message: 'unused' }),
      updateStudentApplicationStatus: async (_req, res) => res.status(501).json({ message: 'unused' }),
      createStudentFromApplication: async (_req, res) => res.status(501).json({ message: 'unused' }),
      deleteStudentApplication: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../controllers/staff.controller': {
      createGatekeeper: async (_req, res) => res.status(501).json({ message: 'unused' }),
      createCoordinator: async (_req, res) => res.status(501).json({ message: 'unused' }),
      createInstructor: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../controllers/students.controller': {
      createStudent: async (req, res) => res.status(201).json({
        message: 'Student created',
        user: { id: 'student-user-2', role: 'STUDENT', email: req.body.email }
      }),
      updateUser: async (_req, res) => res.status(501).json({ message: 'unused' }),
      bulkAssignStudentSection: async (_req, res) => res.status(501).json({ message: 'unused' }),
      promoteStudentSemester: async (_req, res) => res.status(501).json({ message: 'unused' }),
      toggleUserStatus: async (_req, res) => res.status(501).json({ message: 'unused' }),
      deleteUser: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../controllers/bulkImport.controller': {
      importStudents: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getStudentImportJob: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../middleware/auth.middleware': authMiddleware,
    '../middleware/profile.middleware': profileMiddleware,
    '../middleware/rateLimit.middleware': noOpRateLimits,
    '../middleware/upload.middleware': uploadMiddleware,
    '../middleware/validate.middleware': noOpValidate,
    '../validators/schemas': { schemas }
  })
  const app = mountJsonRoute('/api/v1/admin', adminRoutes)

  const statsResponse = await request(app)
    .get('/api/v1/admin/stats')
    .set('Authorization', 'Bearer admin-token')
  const createResponse = await request(app)
    .post('/api/v1/admin/users/student')
    .set('Authorization', 'Bearer admin-token')
    .send({ name: 'New Student', email: 'new.student@example.edu', semester: 1, rollNumber: 'BCA-001' })

  assert.equal(statsResponse.status, 200)
  assert.equal(statsResponse.body.users.students, 120)
  assert.equal(createResponse.status, 201)
  assert.equal(createResponse.body.user.email, 'new.student@example.edu')
})

test('journey: admin posts an assignment and student submits work', async () => {
  const assignmentRoutes = loadWithMocks(resolveFromTest('src', 'routes', 'assignment.routes.js'), {
    '../controllers/assignment.controller': {
      createAssignment: async (req, res) => res.status(201).json({
        message: 'Assignment created',
        assignment: {
          id: 'assignment-1',
          title: req.body.title,
          questionPdfUrl: req.file.url
        }
      }),
      getAllAssignments: async (_req, res) => res.status(501).json({ message: 'unused' }),
      getAssignmentById: async (_req, res) => res.status(501).json({ message: 'unused' }),
      updateAssignment: async (_req, res) => res.status(501).json({ message: 'unused' }),
      deleteAssignment: async (_req, res) => res.status(501).json({ message: 'unused' }),
      submitAssignment: async (req, res) => res.status(201).json({
        message: 'Assignment submitted successfully!',
        submission: {
          id: 'submission-1',
          assignmentId: req.params.id,
          fileUrl: req.file.url
        }
      }),
      getMySubmissions: async (_req, res) => res.status(501).json({ message: 'unused' }),
      gradeSubmission: async (_req, res) => res.status(501).json({ message: 'unused' }),
      exportAssignmentGrades: async (_req, res) => res.status(501).json({ message: 'unused' })
    },
    '../middleware/auth.middleware': authMiddleware,
    '../middleware/profile.middleware': profileMiddleware,
    '../middleware/rateLimit.middleware': noOpRateLimits,
    '../middleware/upload.middleware': uploadMiddleware,
    '../middleware/validate.middleware': noOpValidate,
    '../validators/schemas': { schemas }
  })
  const app = mountJsonRoute('/api/v1/assignments', assignmentRoutes)

  const createResponse = await request(app)
    .post('/api/v1/assignments')
    .set('Authorization', 'Bearer admin-token')
    .send({ title: 'Final Project', subjectId: 'subject-1' })
  const submitResponse = await request(app)
    .post('/api/v1/assignments/assignment-1/submit')
    .set('Authorization', 'Bearer student-token')
    .send({ note: 'Submitted' })

  assert.equal(createResponse.status, 201)
  assert.equal(createResponse.body.assignment.questionPdfUrl, '/api/v1/uploads/questionPdf.pdf')
  assert.equal(submitResponse.status, 201)
  assert.equal(submitResponse.body.submission.assignmentId, 'assignment-1')
})
