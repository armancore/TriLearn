const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)
const testUploadPath = resolveFromTest('test', '.tmp-bulk-import-uploads')

const loadWithMocks = (targetPath, mocks) => {
  const modulePath = path.resolve(targetPath)
  const localRequire = createRequire(modulePath)
  const sourceRoot = resolveFromTest('src')
  const previousCacheKeys = new Set(Object.keys(require.cache))
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

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  headers: {},
  status(code) {
    this.statusCode = code
    return this
  },
  json(payload) {
    this.body = payload
    return this
  },
  setHeader(name, value) {
    this.headers[name] = value
    return this
  },
  internalError(error) {
    throw error
  }
})

const makeCsv = (rows) => [
  'name,email,rollNumber,department,semester,section',
  ...rows.map((row) => [
    row.name,
    row.email,
    row.rollNumber,
    row.department,
    row.semester,
    row.section
  ].join(','))
].join('\n')

const writeTempCsv = async (name, content) => {
  await fs.promises.mkdir(testUploadPath, { recursive: true })
  const filePath = path.join(testUploadPath, name)
  await fs.promises.writeFile(filePath, content)
  return filePath
}

const createPrismaMock = ({ existingUsers = [], existingStudents = [] } = {}) => {
  const createdUsers = []
  const createdStudents = []
  const enrollments = []
  const tx = {
    user: {
      findMany: async (payload) => {
        if (payload?.where?.deletedAt) {
          return []
        }
        return existingUsers
      },
      deleteMany: async () => ({ count: 0 }),
      createMany: async (payload) => {
        createdUsers.push(...payload.data)
        return { count: payload.data.length }
      }
    },
    student: {
      findMany: async () => existingStudents,
      createMany: async (payload) => {
        createdStudents.push(...payload.data)
        return { count: payload.data.length }
      }
    },
    subject: {
      findMany: async () => ([{ id: 'subject-1' }, { id: 'subject-2' }])
    },
    subjectEnrollment: {
      createMany: async (payload) => {
        enrollments.push(...payload.data)
        return { count: payload.data.length }
      }
    }
  }

  return {
    createdUsers,
    createdStudents,
    enrollments,
    prisma: {
      department: {
        findMany: async () => ([
          { name: 'Computer Science', code: 'CS' },
          { name: 'Business Administration', code: 'BBA' }
        ])
      },
      departmentSection: {
        findMany: async () => ([
          { semester: 1, section: 'A', department: { name: 'Computer Science' } },
          { semester: 2, section: 'B', department: { name: 'Business Administration' } }
        ])
      },
      uploadedFile: {
        upsert: async () => ({})
      },
      $transaction: async (callback) => callback(tx)
    }
  }
}

const createNotificationQueueMock = () => {
  const jobs = new Map()

  return {
    jobs,
    queueModule: {
      BULK_STUDENT_IMPORT_JOB: 'bulk-student-import',
      notificationQueue: {
        add: async (_jobName, payload) => {
          const id = String(jobs.size + 1)
          const job = {
            id,
            payload,
            progress: 100,
            failedReason: null,
            returnvalue: null,
            getState: async () => 'completed'
          }
          jobs.set(id, job)
          return job
        },
        getJob: async (jobId) => jobs.get(String(jobId)) || null
      }
    }
  }
}

const createServiceMocks = (prismaMock, queueModule) => ({
  '../utils/prisma': prismaMock,
  '../jobs/notificationQueue': queueModule,
  '../utils/logger': {
    error: () => {},
    warn: () => {}
  },
  '../utils/audit': {
    recordAuditLog: async () => {}
  },
  '../utils/mailer': {
    sendMail: async () => {}
  },
  '../utils/emailTemplates': {
    welcomeTemplate: ({ name }) => ({
      subject: `Welcome ${name}`,
      html: '<p>Welcome</p>',
      text: 'Welcome'
    })
  },
  '../utils/emailVerification': {
    buildEmailVerificationUrl: (token) => `https://trilearn.test/verify/${token}`,
    createEmailVerificationToken: () => ({
      token: 'plain-token',
      tokenHash: 'hashed-token',
      expiresAt: new Date('2030-01-01T00:00:00.000Z')
    })
  },
  '../utils/security': {
    hashPassword: async (password) => `hashed-${password}`,
    generateTemporaryPassword: () => 'TempPassword123!'
  },
  '../utils/statsCache': {
    clearStatsCache: () => {}
  },
  '../utils/redis': {
    isRedisConfigured: () => false,
    getReadyRedisClient: async () => null
  }
})

const createUploadMocks = ({ detectedType = null, uploadCalls = [] } = {}) => ({
  '../utils/prisma': {
    uploadedFile: {
      upsert: async () => ({})
    }
  },
  '../utils/logger': {
    error: () => {},
    warn: () => {}
  },
  '../utils/fileStorage': {
    uploadPath: testUploadPath,
    isS3Configured: () => false,
    uploadFile: async (buffer, fileName, mimeType) => {
      await fs.promises.mkdir(testUploadPath, { recursive: true })
      const filePath = path.join(testUploadPath, fileName)
      await fs.promises.writeFile(filePath, buffer)
      uploadCalls.push({ fileName, mimeType, size: buffer.length, path: filePath })
      return { path: filePath, url: filePath }
    },
    deleteFile: async (filePath) => {
      await fs.promises.unlink(filePath).catch(() => {})
    }
  },
  'file-type': {
    fileTypeFromBuffer: async () => detectedType
  },
  sharp: () => ({
    rotate() {
      return this
    },
    toBuffer: async () => Buffer.from('image'),
    toFile: async () => {}
  })
})

test('valid CSV upload queues a job, tracks status, and creates students when processed', async () => {
  const { prisma, createdUsers, createdStudents, enrollments } = createPrismaMock()
  const { jobs, queueModule } = createNotificationQueueMock()
  const uploadCalls = []

  const { validateUploadedSpreadsheet } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    ...createUploadMocks({ uploadCalls })
  })
  const { importStudents, getStudentImportJob } = loadWithMocks(resolveFromTest('src', 'controllers', 'bulkImport.controller.js'), {
    ...createServiceMocks(prisma, queueModule)
  })
  const { processStudentImportJob } = loadWithMocks(resolveFromTest('src', 'services', 'bulkImport.service.js'), {
    ...createServiceMocks(prisma, queueModule)
  })

  const req = {
    file: {
      buffer: Buffer.from(makeCsv([
        {
          name: 'Asha Sharma',
          email: 'asha@example.edu',
          rollNumber: 'cs-001',
          department: 'CS',
          semester: '1',
          section: 'A'
        },
        {
          name: 'Bimal Thapa',
          email: 'bimal@example.edu',
          rollNumber: 'cs-002',
          department: 'Computer Science',
          semester: '1',
          section: 'A'
        }
      ])),
      originalname: 'students.csv',
      mimetype: 'text/csv',
      size: 256
    },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const validationRes = createResponse()
  let nextCalled = false

  await validateUploadedSpreadsheet(req, validationRes, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, true)
  assert.equal(uploadCalls.length, 1)
  assert.ok(req.file.path.endsWith('.csv'))

  const uploadRes = createResponse()
  await importStudents(req, uploadRes)

  assert.equal(uploadRes.statusCode, 202)
  assert.equal(uploadRes.body.message, 'Student import queued.')
  assert.equal(uploadRes.body.jobId, '1')
  assert.equal(uploadRes.body.statusUrl, '/api/v1/admin/users/student-import/1')
  assert.equal(jobs.get('1').payload.file.path, req.file.path)
  assert.equal(jobs.get('1').payload.user.role, 'ADMIN')

  const result = await processStudentImportJob(jobs.get('1').payload)
  jobs.get('1').returnvalue = result

  assert.equal(result.summary.processed, 2)
  assert.equal(result.summary.created, 2)
  assert.equal(result.summary.failed, 0)
  assert.equal(createdUsers.length, 2)
  assert.equal(createdUsers[0].email, 'asha@example.edu')
  assert.equal(createdStudents.length, 2)
  assert.equal(createdStudents[0].rollNumber, 'CS-001')
  assert.equal(enrollments.length, 4)

  const statusRes = createResponse()
  await getStudentImportJob({ params: { jobId: '1' } }, statusRes)

  assert.equal(statusRes.statusCode, 200)
  assert.equal(statusRes.body.id, '1')
  assert.equal(statusRes.body.state, 'completed')
  assert.equal(statusRes.body.result.summary.created, 2)
})

test('student import neutralizes formula-like string fields before storing', async () => {
  const { prisma, createdUsers, createdStudents } = createPrismaMock()
  const { queueModule } = createNotificationQueueMock()
  const { processStudentImportJob } = loadWithMocks(resolveFromTest('src', 'services', 'bulkImport.service.js'), {
    ...createServiceMocks(prisma, queueModule)
  })
  const csv = [
    'name,email,rollNumber,phone,address,department,semester,section',
    'Asha Sharma,asha-formula@example.edu,"=HYPERLINK(""http://evil.test"",""click"")",=1+1,+SUM(1+1),CS,1,A'
  ].join('\n')
  const filePath = await writeTempCsv('formula-fields.csv', csv)

  const result = await processStudentImportJob({
    file: {
      path: filePath,
      originalname: 'formula-fields.csv',
      filename: 'formula-fields.csv',
      mimetype: 'text/csv',
      size: csv.length
    },
    user: { id: 'admin-1', role: 'ADMIN' }
  })

  assert.equal(result.summary.created, 1)
  assert.equal(createdStudents[0].rollNumber, '\'=HYPERLINK("HTTP://EVIL.TEST","CLICK")')
  assert.equal(createdUsers[0].phone, "'=1+1")
  assert.equal(createdUsers[0].address, "'+SUM(1+1)")
})

test('malformed spreadsheet upload is rejected before processing', async () => {
  const uploadCalls = []
  const { validateUploadedSpreadsheet } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    ...createUploadMocks({
      detectedType: { ext: 'pdf', mime: 'application/pdf' },
      uploadCalls
    })
  })

  const req = {
    file: {
      buffer: Buffer.from('%PDF-1.7 spoofed spreadsheet'),
      originalname: 'students.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedSpreadsheet(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 400)
  assert.equal(res.body.message, 'Invalid file: content does not match a valid spreadsheet format')
  assert.equal(nextCalled, false)
  assert.equal(uploadCalls.length, 0)
  assert.equal(req.file.path, undefined)
})

test('duplicate rollNumber in import returns partial success with row errors', async () => {
  const { prisma, createdUsers, createdStudents } = createPrismaMock()
  const { queueModule } = createNotificationQueueMock()
  const { processStudentImportJob } = loadWithMocks(resolveFromTest('src', 'services', 'bulkImport.service.js'), {
    ...createServiceMocks(prisma, queueModule)
  })
  const filePath = await writeTempCsv('duplicates.csv', makeCsv([
    {
      name: 'Asha Sharma',
      email: 'asha@example.edu',
      rollNumber: 'cs-001',
      department: 'CS',
      semester: '1',
      section: 'A'
    },
    {
      name: 'Bimal Thapa',
      email: 'bimal@example.edu',
      rollNumber: 'CS-001',
      department: 'CS',
      semester: '1',
      section: 'A'
    }
  ]))

  const result = await processStudentImportJob({
    file: {
      path: filePath,
      originalname: 'duplicates.csv',
      filename: 'duplicates.csv',
      mimetype: 'text/csv',
      size: 128
    },
    user: { id: 'admin-1', role: 'ADMIN' }
  })

  assert.equal(result.summary.processed, 2)
  assert.equal(result.summary.created, 1)
  assert.equal(result.summary.failed, 1)
  assert.equal(createdUsers.length, 1)
  assert.equal(createdStudents.length, 1)
  assert.equal(result.failures.length, 1)
  assert.equal(result.failures[0].rowNumber, 3)
  assert.equal(result.failures[0].message, 'This student ID is duplicated in the import file')
})

test('missing required student fields returns validation errors per row', async () => {
  const { prisma, createdUsers } = createPrismaMock()
  const { queueModule } = createNotificationQueueMock()
  const { processStudentImportFile } = loadWithMocks(resolveFromTest('src', 'services', 'bulkImport.service.js'), {
    ...createServiceMocks(prisma, queueModule)
  })
  const filePath = await writeTempCsv('missing-fields.csv', makeCsv([
    {
      name: '',
      email: 'missing-name@example.edu',
      rollNumber: 'cs-003',
      department: 'CS',
      semester: '1',
      section: 'A'
    },
    {
      name: 'Missing Email',
      email: '',
      rollNumber: 'cs-004',
      department: 'CS',
      semester: '1',
      section: 'A'
    },
    {
      name: 'Missing Semester',
      email: 'missing-semester@example.edu',
      rollNumber: 'cs-005',
      department: 'CS',
      semester: '',
      section: 'A'
    }
  ]))
  const responder = {
    serviceResult: null,
    withStatus(statusCode, body) {
      this.serviceResult = { statusCode, body }
      return this.serviceResult
    }
  }

  await processStudentImportFile({
    file: {
      path: filePath,
      originalname: 'missing-fields.csv'
    },
    user: { id: 'admin-1', role: 'ADMIN' }
  }, responder)

  assert.equal(responder.serviceResult.statusCode, 400)
  assert.equal(responder.serviceResult.body.summary.processed, 3)
  assert.equal(responder.serviceResult.body.summary.created, 0)
  assert.equal(responder.serviceResult.body.summary.failed, 3)
  assert.equal(createdUsers.length, 0)
  assert.deepEqual(
    responder.serviceResult.body.failures.map((failure) => [failure.rowNumber, failure.message]),
    [
      [2, 'Name must be at least 2 characters long'],
      [3, 'Email must be a valid email address'],
      [4, 'Semester must be a number between 1 and 8']
    ]
  )
})

test('student import route rejects unauthorized roles before upload handling', async () => {
  const { allowRoles } = loadWithMocks(resolveFromTest('src', 'middleware', 'auth.middleware.js'), {
    '../utils/prisma': {},
    '../utils/logger': {
      error: () => {}
    },
    '../utils/instructorDepartments': {
      getInstructorDepartments: () => []
    },
    '../utils/redis': {
      getReadyRedisClient: async () => null
    },
    '../constants/auth': {
      REVOKED_JTI_PREFIX: 'revoked:'
    }
  })
  const req = {
    user: { id: 'student-user-1', role: 'STUDENT' }
  }
  const res = createResponse()
  let nextCalled = false

  allowRoles('ADMIN', 'COORDINATOR')(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 403)
  assert.equal(res.body.message, 'Access denied. Only ADMIN, COORDINATOR can do this.')
  assert.equal(nextCalled, false)
})

test('empty student import file returns 400', async () => {
  const { prisma } = createPrismaMock()
  const { queueModule } = createNotificationQueueMock()
  const { processStudentImportFile } = loadWithMocks(resolveFromTest('src', 'services', 'bulkImport.service.js'), {
    ...createServiceMocks(prisma, queueModule)
  })
  const filePath = await writeTempCsv('empty.csv', makeCsv([]))
  const responder = {
    serviceResult: null,
    withStatus(statusCode, body) {
      this.serviceResult = { statusCode, body }
      return this.serviceResult
    }
  }

  await processStudentImportFile({
    file: {
      path: filePath,
      originalname: 'empty.csv'
    },
    user: { id: 'admin-1', role: 'ADMIN' }
  }, responder)

  assert.equal(responder.serviceResult.statusCode, 400)
  assert.equal(responder.serviceResult.body.message, 'The uploaded file does not contain any student rows')
})
