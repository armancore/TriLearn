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
    headers: {},
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
    setHeader(name, value) {
      this.headers[name] = value
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

test('register blocks self-registration when OPEN_REGISTRATION is disabled', async () => {
  const previousOpenRegistration = process.env.OPEN_REGISTRATION
  process.env.OPEN_REGISTRATION = 'false'

  try {
    const { register } = loadWithMocks(resolveFromTest('src', 'controllers', 'auth.controller.js'), authControllerMocks())

    const req = {
      body: {
        name: 'Student User',
        email: 'student@example.com',
        password: 'Password123'
      }
    }
    const res = createResponse()

    await register(req, res)

    assert.equal(res.statusCode, 403)
    assert.deepEqual(res.body, {
      message: 'Self-registration is disabled. Please apply through the student intake form.'
    })
  } finally {
    if (previousOpenRegistration === undefined) {
      delete process.env.OPEN_REGISTRATION
    } else {
      process.env.OPEN_REGISTRATION = previousOpenRegistration
    }
  }
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
  let userCountCalls = 0
  let subjectCountCalls = 0
  const { getAdminStats } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      user: {
        count: async ({ where } = {}) => {
          userCountCalls += 1
          if (!where) return 42
          if (where.role === 'STUDENT') return 30
          if (where.role === 'INSTRUCTOR') return 7
          if (where.role === 'COORDINATOR') return 3
          if (where.role === 'GATEKEEPER') return 2
          return 0
        }
      },
      subject: {
        count: async () => {
          subjectCountCalls += 1
          return 18
        }
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

  const firstRes = createResponse()
  await getAdminStats({}, firstRes)

  const secondRes = createResponse()
  await getAdminStats({}, secondRes)

  assert.equal(firstRes.statusCode, 200)
  assert.deepEqual(firstRes.body, {
    stats: {
      totalUsers: 42,
      totalStudents: 30,
      totalInstructors: 7,
      totalCoordinators: 3,
      totalGatekeepers: 2,
      totalSubjects: 18
    }
  })
  assert.deepEqual(secondRes.body, firstRes.body)
  assert.equal(userCountCalls, 5)
  assert.equal(subjectCountCalls, 1)
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
  const upsertCalls = []
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
          upsert: async (payload) => {
            upsertCalls.push(payload)
            return {
              id: 'attendance-1',
              status: 'PRESENT',
              date: payload.create.date,
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
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].create.studentId, 'student-1')
  assert.equal(upsertCalls[0].create.subjectId, 'subject-1')
})

test('exportMyMarksheetPdf streams a semester marksheet for published student results', async () => {
  const docOperations = []
  class MockPdfDocument {
    constructor() {
      this.y = 0
    }

    pipe(target) {
      this.target = target
      return this
    }

    fontSize(value) {
      docOperations.push(['fontSize', value])
      return this
    }

    text(value) {
      docOperations.push(['text', value])
      return this
    }

    moveDown() {
      docOperations.push(['moveDown'])
      return this
    }

    addPage() {
      docOperations.push(['addPage'])
      return this
    }

    fillColor(value) {
      docOperations.push(['fillColor', value])
      return this
    }

    end() {
      docOperations.push(['end'])
      return this
    }
  }

  const { exportMyMarksheetPdf } = loadWithMocks(resolveFromTest('src', 'controllers', 'marks.controller.js'), {
    '../utils/prisma': {
      mark: {
        findMany: async ({ where, distinct } = {}) => {
          if (distinct) {
            return [{ examType: 'FINAL' }]
          }

          if (where?.studentId === 'student-1') {
            return [
              {
                id: 'mark-1',
                studentId: 'student-1',
                subjectId: 'subject-1',
                obtainedMarks: 88,
                totalMarks: 100,
                remarks: 'Great work',
                subject: { name: 'Database Systems', code: 'DBS101', semester: 3 }
              },
              {
                id: 'mark-2',
                studentId: 'student-1',
                subjectId: 'subject-2',
                obtainedMarks: 76,
                totalMarks: 100,
                remarks: '',
                subject: { name: 'Operating Systems', code: 'OS201', semester: 3 }
              }
            ]
          }

          return [
            {
              studentId: 'student-1',
              obtainedMarks: 88,
              totalMarks: 100,
              subject: { code: 'DBS101' }
            },
            {
              studentId: 'student-2',
              obtainedMarks: 70,
              totalMarks: 100,
              subject: { code: 'DBS101' }
            }
          ]
        },
        count: async () => 2
      },
      student: {
        findMany: async () => ([
          { id: 'student-1', user: { id: 'user-1', name: 'Arman Dev' } },
          { id: 'student-2', user: { id: 'user-2', name: 'Student Two' } }
        ]),
        findUnique: async () => ({
          id: 'student-1',
          rollNumber: 'STU-001',
          semester: 3,
          section: 'A',
          department: 'BCA',
          user: { name: 'Arman Dev', email: 'arman@example.com' }
        })
      }
    },
    '../utils/pagination': {
      getPagination: () => ({ page: 1, limit: 10, skip: 0 })
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/notifications': {
      createNotifications: async () => {}
    },
    pdfkit: MockPdfDocument
  })

  const req = {
    query: { examType: 'FINAL' },
    student: { id: 'student-1', semester: 3, department: 'BCA' }
  }
  const res = createResponse()

  await exportMyMarksheetPdf(req, res)

  assert.equal(res.headers['Content-Type'], 'application/pdf')
  assert.match(res.headers['Content-Disposition'], /marksheet-stu-001-sem-3-final\.pdf/i)
  assert.ok(docOperations.some((operation) => operation[0] === 'text' && /Semester Marksheet/i.test(operation[1])))
  assert.ok(docOperations.some((operation) => operation[0] === 'text' && /Database Systems/i.test(operation[1])))
  assert.ok(docOperations.some((operation) => operation[0] === 'end'))
})

test('getDayRange uses the configured attendance timezone for date boundaries', () => {
  const previousTimezone = process.env.ATTENDANCE_TIMEZONE
  process.env.ATTENDANCE_TIMEZONE = 'Asia/Kathmandu'
  try {
    const { getDayRange } = loadWithMocks(resolveFromTest('src', 'controllers', 'attendance', 'shared.js'), {
      '../../utils/prisma': {},
      '../../utils/audit': {
        recordAuditLog: async () => {}
      },
      '../../utils/security': {
        getRequiredSecret: () => 'test-secret'
      }
    })

    const range = getDayRange('2026-04-04')

    assert.equal(range.start.toISOString(), '2026-04-03T18:15:00.000Z')
    assert.equal(range.end.toISOString(), '2026-04-04T18:15:00.000Z')
  } finally {
    if (previousTimezone === undefined) {
      delete process.env.ATTENDANCE_TIMEZONE
    } else {
      process.env.ATTENDANCE_TIMEZONE = previousTimezone
    }
  }
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

test('createRoutine blocks instructor double-booking with a specific error', async () => {
  const { createRoutine } = loadWithMocks(resolveFromTest('src', 'controllers', 'routine.controller.js'), {
    '../utils/prisma': {
      subject: {
        findUnique: async () => ({ id: 'subject-1', semester: 3, department: 'BCA' })
      },
      instructor: {
        findUnique: async () => ({ id: 'instructor-1' })
      },
      routine: {
        findFirst: async () => ({
          id: 'routine-2',
          instructorId: 'instructor-1',
          room: 'Room 102'
        })
      }
    }
  })

  const req = {
    body: {
      subjectId: 'subject-1',
      instructorId: 'instructor-1',
      department: 'BCA',
      semester: 3,
      section: 'A',
      dayOfWeek: 'SUNDAY',
      startTime: '10:00',
      endTime: '11:00',
      room: 'Room 101'
    }
  }
  const res = createResponse()

  await createRoutine(req, res)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, {
    message: 'This instructor already has a class at this time.'
  })
})

test('createRoutine allows combined classes sharing the same room and combinedGroupId', async () => {
  const createCalls = []
  const findFirstCalls = []
  const { createRoutine } = loadWithMocks(resolveFromTest('src', 'controllers', 'routine.controller.js'), {
    '../utils/prisma': {
      subject: {
        findUnique: async () => ({ id: 'subject-1', semester: 3, department: 'BCA' })
      },
      instructor: {
        findUnique: async () => ({ id: 'instructor-1' })
      },
      routine: {
        findFirst: async (payload) => {
          findFirstCalls.push(payload)
          return null
        },
        create: async (payload) => {
          createCalls.push(payload)
          return {
            id: 'routine-1',
            ...payload.data,
            subject: { id: 'subject-1', name: 'DSA', code: 'CSC201', semester: 3, department: 'BCA' },
            instructor: { id: 'instructor-1', user: { name: 'Instructor One' } }
          }
        }
      }
    }
  })

  const req = {
    body: {
      subjectId: 'subject-1',
      instructorId: 'instructor-1',
      department: 'BCA',
      semester: 3,
      section: 'A',
      combinedGroupId: '123e4567-e89b-12d3-a456-426614174000',
      dayOfWeek: 'SUNDAY',
      startTime: '10:00',
      endTime: '11:00',
      room: 'Room 101'
    }
  }
  const res = createResponse()

  await createRoutine(req, res)

  assert.equal(res.statusCode, 201)
  assert.equal(findFirstCalls[0].where.OR[0].combinedGroupId.not, '123e4567-e89b-12d3-a456-426614174000')
  assert.equal(createCalls[0].data.combinedGroupId, '123e4567-e89b-12d3-a456-426614174000')
})
