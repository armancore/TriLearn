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
    sentFile: null,
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
    sendFile(filePath, options) {
      this.sentFile = { filePath, options }
      return this
    },
    internalError(error) {
      throw error
    }
  }

  return res
}

test('serveUploadedFile denies access to another user avatar', async () => {
  const { serveUploadedFile } = loadWithMocks(resolveFromTest('src', 'controllers', 'upload.controller.js'), {
    '../utils/prisma': {
      user: {
        findFirst: async () => ({ id: 'avatar-owner-1' })
      }
    },
    '../utils/fileStorage': {
      uploadPath: 'C:\\uploads',
      uploadPublicPath: '/api/v1/uploads'
    },
    '../middleware/csrf.middleware': {
      getTrustedOrigins: () => []
    }
  })

  const req = {
    params: { filename: 'avatar.png' },
    user: { id: 'different-user', role: 'STUDENT' }
  }
  const res = createResponse()

  await serveUploadedFile(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { message: 'Access denied' })
  assert.equal(res.sentFile, null)
})

test('validateUploadedPdf writes a valid PDF to disk only after in-memory validation', async () => {
  const writeCalls = []
  const { validateUploadedPdf } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    fs: {
      promises: {
        writeFile: async (filePath, buffer) => {
          writeCalls.push({ filePath, buffer: Buffer.from(buffer) })
        },
        unlink: async () => {}
      }
    },
    sharp: () => ({
      rotate: () => ({
        toFile: async () => {}
      })
    }),
    '../utils/logger': {
      error: () => {}
    },
    '../utils/fileStorage': {
      uploadPath: 'C:\\uploads'
    }
  })

  const req = {
    file: {
      originalname: 'assignment.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7 valid payload')
    }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedPdf(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, true)
  assert.equal(writeCalls.length, 1)
  assert.match(writeCalls[0].filePath, /assignment\.pdf$/i)
  assert.equal(req.file.filename.endsWith('-assignment.pdf'), true)
  assert.match(String(req.file.path), /assignment\.pdf$/i)
})

test('validateUploadedPdf rejects invalid PDF content before any disk write', async () => {
  const writeCalls = []
  const { validateUploadedPdf } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    fs: {
      promises: {
        writeFile: async (...args) => {
          writeCalls.push(args)
        },
        unlink: async () => {}
      }
    },
    sharp: () => ({
      rotate: () => ({
        toFile: async () => {}
      })
    }),
    '../utils/logger': {
      error: () => {}
    },
    '../utils/fileStorage': {
      uploadPath: 'C:\\uploads'
    }
  })

  const req = {
    file: {
      originalname: 'malware.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('<html>not really a pdf</html>')
    }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedPdf(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Uploaded file content is not a valid PDF' })
  assert.equal(writeCalls.length, 0)
  assert.equal(req.file.path, undefined)
})

test('uploadPdf rejects files unless the MIME type is application/pdf', async () => {
  const { uploadPdf } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    sharp: () => ({
      rotate: () => ({
        toFile: async () => {}
      })
    }),
    '../utils/logger': {
      error: () => {}
    },
    '../utils/fileStorage': {
      uploadPath: 'C:\\uploads'
    }
  })

  const app = express()
  app.post('/upload', (req, _res, next) => {
    req.user = { role: 'INSTRUCTOR' }
    next()
  }, uploadPdf.single('questionPdf'), (_req, res) => {
    res.status(201).json({ ok: true })
  })

  const response = await request(app)
    .post('/upload')
    .attach('questionPdf', Buffer.from('<html>evil</html>'), {
      filename: 'malware.pdf',
      contentType: 'text/html'
    })

  assert.equal(response.status, 400)
  assert.deepEqual(response.body, { message: 'Only PDF files are allowed' })
})

test('serveUploadedFile serves assignment PDFs with hardened headers', async () => {
  const { serveUploadedFile } = loadWithMocks(resolveFromTest('src', 'controllers', 'upload.controller.js'), {
    '../utils/prisma': {
      user: {
        findFirst: async () => null
      },
      assignment: {
        findFirst: async () => ({
          id: 'assignment-1',
          subjectId: 'subject-1',
          instructorId: 'instructor-1'
        })
      },
      submission: {
        findFirst: async () => null
      },
      studyMaterial: {
        findFirst: async () => null
      }
    },
    '../utils/fileStorage': {
      uploadPath: 'C:\\uploads',
      uploadPublicPath: '/api/v1/uploads'
    },
    '../middleware/csrf.middleware': {
      getTrustedOrigins: () => ['http://localhost:5173']
    }
  })

  const req = {
    params: { filename: 'assignment.pdf' },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const res = createResponse()

  await serveUploadedFile(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff')
  assert.match(res.headers['Content-Security-Policy'], /sandbox allow-scripts allow-downloads/)
  assert.equal(res.sentFile.options.headers['Content-Type'], 'application/pdf')
  assert.equal(res.sentFile.options.headers['Content-Disposition'], 'inline')
})

test('createStudent does not return plaintext temporary passwords', async () => {
  const auditCalls = []
  const sentEmails = []

  const { createStudent } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      user: {
        findUnique: async () => null,
        create: async ({ data }) => ({
          id: 'user-student-1',
          name: data.name,
          email: data.email,
          role: 'STUDENT',
          student: {
            id: 'student-1',
            rollNumber: data.student.create.rollNumber,
            semester: data.student.create.semester,
            section: data.student.create.section,
            department: data.student.create.department
          }
        })
      },
      student: {
        findUnique: async () => null
      }
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
      recordAuditLog: async (payload) => {
        auditCalls.push(payload)
      }
    },
    '../utils/mailer': {
      sendMail: async (payload) => {
        sentEmails.push(payload)
      }
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    },
    '../utils/security': {
      getStudentTemporaryPassword: () => 'TempPass123!',
      hashPassword: async () => 'hashed-temp-password'
    },
    '../utils/instructorDepartments': {
      normalizeDepartmentList: (values) => values.filter(Boolean)
    },
    exceljs: {
      Workbook: class MockWorkbook {}
    }
  })

  const req = {
    body: {
      name: 'Student One',
      email: 'student1@example.com',
      studentId: 'stu-001',
      phone: '9800000000',
      address: 'Kathmandu',
      semester: 1,
      section: 'A',
      department: 'BCA'
    },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const res = createResponse()

  await createStudent(req, res)

  assert.equal(res.statusCode, 201)
  assert.equal(sentEmails.length, 1)
  assert.equal(res.body.welcomeEmailSent, true)
  assert.equal('temporaryPassword' in res.body.user, false)
  assert.equal(JSON.stringify(res.body).includes('TempPass123!'), false)
  assert.equal(auditCalls.length, 1)
})
