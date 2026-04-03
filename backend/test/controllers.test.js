const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')

const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)

const loadWithMocks = (targetPath, mocks) => {
  const modulePath = path.resolve(targetPath)
  const localRequire = createRequire(modulePath)
  const touched = []

  for (const [request, mockExports] of Object.entries(mocks)) {
    const resolved = localRequire.resolve(request)
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

const createResponse = () => {
  const res = {
    statusCode: 200,
    body: undefined,
    cookies: [],
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    cookie(...args) {
      this.cookies.push(args)
      return this
    },
    internalError(error) {
      throw error
    }
  }

  return res
}

const authControllerMocks = (overrides = {}) => ({
  '../utils/prisma': {},
  'bcryptjs': {
    compare: async () => false,
    hash: async () => 'hashed'
  },
  '../utils/enrollment': {
    enrollStudentInMatchingSubjects: async () => {}
  },
  '../utils/logger': {
    info: () => {},
    error: () => {},
    warn: () => {}
  },
  '../utils/token': {
    signAccessToken: () => 'access-token',
    signRefreshToken: () => 'refresh-token',
    verifyRefreshToken: () => ({ id: 'user-1' }),
    hashToken: () => 'hash',
    getRefreshTokenExpiry: () => new Date(),
    getRefreshCookieOptions: () => ({})
  },
  '../utils/mailer': {
    sendMail: async () => {}
  },
  '../utils/emailTemplates': {
    passwordResetTemplate: () => ({ subject: 'Reset', html: '<p>Reset</p>', text: 'Reset' })
  },
  'qrcode': {
    toDataURL: async () => 'data:image/png;base64,qr'
  },
  ...overrides
})

test('login returns generic invalid credentials when user does not exist', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'

  const { login } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      user: {
        findUnique: async () => null
      }
    }
  }))

  const req = {
    body: {
      email: 'missing@example.com',
      password: 'wrong-password'
    }
  }
  const res = createResponse()

  await login(req, res)

  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { message: 'Invalid credentials' })
})

test('allowRoles blocks unauthorized roles with 403', async () => {
  const { allowRoles } = loadWithMocks(resolveFromTest('src', 'middleware', 'auth.middleware.js'), {
    '../utils/prisma': {
      user: {
        findUnique: async () => null
      }
    },
    '../utils/logger': {
      error: () => {}
    }
  })

  const middleware = allowRoles('ADMIN', 'COORDINATOR')
  const req = { user: { role: 'STUDENT' } }
  const res = createResponse()
  let nextCalled = false

  middleware(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    message: 'Access denied. Only ADMIN, COORDINATOR can do this.'
  })
})

test('getAdminStats returns server-side aggregate counts', async () => {
  const { getAdminStats } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      user: {
        count: async ({ where } = {}) => {
          if (!where) return 42
          if (where.role === 'STUDENT') return 30
          if (where.role === 'INSTRUCTOR') return 7
          if (where.role === 'COORDINATOR') return 3
          if (where.role === 'GATEKEEPER') return 2
          return 0
        }
      },
      subject: {
        count: async () => 18
      }
    },
    'bcryptjs': {
      hash: async () => 'hashed'
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.controller': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    }
  })

  const res = createResponse()
  await getAdminStats({}, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, {
    stats: {
      totalUsers: 42,
      totalStudents: 30,
      totalInstructors: 7,
      totalCoordinators: 3,
      totalGatekeepers: 2,
      totalSubjects: 18
    }
  })
})

test('submitStudentIntake upserts the application payload and returns success', async () => {
  process.env.QR_SIGNING_SECRET = 'test-qr-secret'

  const upsertCalls = []
  const { submitStudentIntake } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks({
    '../utils/prisma': {
      studentApplication: {
        findUnique: async () => null,
        upsert: async (payload) => {
          upsertCalls.push(payload)
          return payload
        }
      },
      user: {
        findUnique: async () => null
      }
    }
  }))

  const req = {
    body: {
      fullName: 'Arman Dev',
      email: 'arman@example.com',
      phone: '9800000000',
      fatherName: 'Father Name',
      motherName: 'Mother Name',
      fatherPhone: '9800000001',
      motherPhone: '9800000002',
      bloodGroup: 'A+',
      localGuardianName: 'Guardian Name',
      localGuardianAddress: 'Kathmandu',
      localGuardianPhone: '9800000003',
      permanentAddress: 'Bhaktapur',
      temporaryAddress: 'Lalitpur',
      dateOfBirth: '2005-01-01',
      preferredDepartment: 'BCA'
    }
  }
  const res = createResponse()

  await submitStudentIntake(req, res)

  assert.equal(res.statusCode, 201)
  assert.match(res.body.message, /submitted successfully/i)
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].where.email, 'arman@example.com')
  assert.equal(upsertCalls[0].create.preferredDepartment, 'BCA')
})

test('markAttendanceQR creates a present attendance record for eligible students', async () => {
  const createCalls = []
  const { markAttendanceQR } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'qr.controller.js'), {
    './shared': {
      QR_VALIDITY_MINUTES: 15,
      prisma: {
        subject: {
          findUnique: async () => ({ id: 'subject-1', name: 'Database Systems' })
        },
        subjectEnrollment: {
          findUnique: async () => ({ id: 'enrollment-1' })
        },
        attendance: {
          create: async (payload) => {
            createCalls.push(payload)
            return {
              id: 'attendance-1',
              status: 'PRESENT',
              date: payload.data.date,
              subject: { name: 'Database Systems', code: 'DBS101' },
              student: { user: { name: 'Arman Dev' } }
            }
          }
        }
      },
      getDayRange: () => ({
        start: new Date('2026-04-03T00:00:00.000Z'),
        end: new Date('2026-04-04T00:00:00.000Z')
      }),
      getOwnedSubject: async () => ({}),
      createSignedQrPayload: () => 'signed',
      parseQrPayload: () => ({
        subjectId: 'subject-1',
        instructorId: 'instructor-1',
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      }),
      getDailyGateWindows: async () => ({}),
      normalizeSemesterList: () => [],
      getEligibleGateAttendanceForStudent: async () => ({}),
      upsertPresentAttendanceForRoutines: async () => ({}),
      syncClosedRoutineAbsences: async () => {},
      getStudentByIdCardQr: async () => ({}),
      recordAuditLog: async () => {}
    },
    qrcode: {
      toDataURL: async () => 'data:image/png;base64,qr'
    }
  })

  const req = {
    body: { qrData: 'qr-payload' },
    user: { id: 'user-1', role: 'STUDENT' },
    student: { id: 'student-1' }
  }
  const res = createResponse()

  await markAttendanceQR(req, res)

  assert.equal(res.statusCode, 201)
  assert.match(res.body.message, /attendance marked successfully/i)
  assert.equal(createCalls.length, 1)
  assert.equal(createCalls[0].data.studentId, 'student-1')
  assert.equal(createCalls[0].data.subjectId, 'subject-1')
})

test('publishMarks publishes marks for a coordinator department and returns count', async () => {
  const updateManyCalls = []
  const countCalls = []
  const { publishMarks } = loadWithMocks(resolveFromTest('src', 'controllers', 'marks.controller.js'), {
    '../utils/prisma': {
      mark: {
        count: async (payload) => {
          countCalls.push(payload)
          return 2
        },
        updateMany: async (payload) => {
          updateManyCalls.push(payload)
          return { count: 2 }
        },
        findMany: async () => ([
          {
            student: { userId: 'user-student-1' },
            subject: { name: 'Database Systems' }
          },
          {
            student: { userId: 'user-student-2' },
            subject: { name: 'Database Systems' }
          }
        ])
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 10, skip: 0 })
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/notifications': {
      createNotifications: async () => ({ count: 2 })
    }
  })

  const req = {
    body: {
      subjectId: 'subject-1',
      examType: 'MIDTERM'
    },
    user: { id: 'coordinator-user-1', role: 'COORDINATOR' },
    coordinator: { department: 'BCA' }
  }
  const res = createResponse()

  await publishMarks(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.count, 2)
  assert.equal(countCalls.length, 1)
  assert.equal(updateManyCalls.length, 1)
  assert.equal(updateManyCalls[0].where.subject.department, 'BCA')
  assert.equal(updateManyCalls[0].where.subjectId, 'subject-1')
  assert.equal(updateManyCalls[0].where.examType, 'MIDTERM')
})
