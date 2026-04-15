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
  const auditCalls = []
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
    '../utils/audit': {
      recordAuditLog: async (payload) => {
        auditCalls.push(payload)
      }
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
  assert.equal(auditCalls.length, 1)
  assert.equal(auditCalls[0].action, 'UPLOAD_FILE_ACCESS_DENIED')
  assert.equal(auditCalls[0].entityId, 'avatar.png')
})

test('serveUploadedFile denies instructor access to another user avatar', async () => {
  const auditCalls = []
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
    '../utils/audit': {
      recordAuditLog: async (payload) => {
        auditCalls.push(payload)
      }
    },
    '../middleware/csrf.middleware': {
      getTrustedOrigins: () => []
    }
  })

  const req = {
    params: { filename: 'avatar.png' },
    user: {
      id: 'instructor-user-1',
      role: 'INSTRUCTOR',
      instructor: { id: 'instructor-1' }
    }
  }
  const res = createResponse()

  await serveUploadedFile(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { message: 'Access denied' })
  assert.equal(res.sentFile, null)
  assert.equal(auditCalls.length, 1)
  assert.equal(auditCalls[0].action, 'UPLOAD_FILE_ACCESS_DENIED')
  assert.equal(auditCalls[0].entityId, 'avatar.png')
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
    'pdf-lib': {
      PDFDocument: {
        load: async () => ({})
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
  assert.equal(req.file.originalname, 'assignment.pdf')
  assert.match(String(req.file.path), /assignment\.pdf$/i)
})

test('validateUploadedPdf sanitizes the uploaded original filename before it propagates', async () => {
  const { validateUploadedPdf } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    fs: {
      promises: {
        writeFile: async () => {},
        unlink: async () => {}
      }
    },
    'pdf-lib': {
      PDFDocument: {
        load: async () => ({})
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
      originalname: '../../../../etc/passwd.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7 valid payload')
    }
  }
  const res = createResponse()

  await validateUploadedPdf(req, res, () => {})

  assert.equal(req.file.originalname, 'passwd.pdf')
  assert.match(req.file.filename, /passwd\.pdf$/i)
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
    'pdf-lib': {
      PDFDocument: {
        load: async () => {
          throw new Error('invalid pdf')
        }
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

test('validateUploadedPdf rejects files that spoof the PDF header but fail structural parsing', async () => {
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
    'pdf-lib': {
      PDFDocument: {
        load: async () => {
          throw new Error('unexpected object')
        }
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
      originalname: 'evil.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 <html><script>alert(1)</script>')
    }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedPdf(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Unable to validate uploaded file' })
  assert.equal(writeCalls.length, 0)
})

test('validateUploadedImage writes a valid image to disk only after in-memory validation', async () => {
  const toFileCalls = []
  const { validateUploadedImage } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    fs: {
      promises: {
        unlink: async () => {}
      }
    },
    sharp: (input) => ({
      rotate: () => ({
        toFile: async (filePath) => {
          toFileCalls.push({
            input: Buffer.from(input),
            filePath
          })
        }
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
      originalname: 'avatar.png',
      mimetype: 'image/png',
      buffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
    }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedImage(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, true)
  assert.equal(toFileCalls.length, 1)
  assert.equal(toFileCalls[0].input.equals(req.file.buffer), true)
  assert.match(toFileCalls[0].filePath, /avatar\.png$/i)
  assert.equal(req.file.filename.endsWith('-avatar.png'), true)
  assert.equal(req.file.originalname, 'avatar.png')
  assert.match(String(req.file.path), /avatar\.png$/i)
})

test('validateUploadedImage rejects invalid image content before any disk write', async () => {
  let sharpCalls = 0
  const { validateUploadedImage } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    fs: {
      promises: {
        unlink: async () => {}
      }
    },
    sharp: () => {
      sharpCalls += 1
      return {
        rotate: () => ({
          toFile: async () => {}
        })
      }
    },
    '../utils/logger': {
      error: () => {}
    },
    '../utils/fileStorage': {
      uploadPath: 'C:\\uploads'
    }
  })

  const req = {
    file: {
      originalname: 'avatar.png',
      mimetype: 'image/png',
      buffer: Buffer.from('not really an image')
    }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedImage(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Uploaded file content is not a valid image' })
  assert.equal(sharpCalls, 0)
  assert.equal(req.file.path, undefined)
})

test('validateUploadedSpreadsheet writes a valid spreadsheet to disk only after byte-level validation', async () => {
  const writeCalls = []
  const { validateUploadedSpreadsheet } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    fs: {
      promises: {
        writeFile: async (filePath, buffer) => {
          writeCalls.push({ filePath, buffer: Buffer.from(buffer) })
        },
        unlink: async () => {}
      }
    },
    'file-type': {
      fileTypeFromBuffer: async () => ({
        ext: 'xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
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
      originalname: 'students.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK\x03\x04pretend-xlsx')
    }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedSpreadsheet(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, true)
  assert.equal(writeCalls.length, 1)
  assert.match(writeCalls[0].filePath, /students\.xlsx$/i)
  assert.equal(req.file.filename.endsWith('-students.xlsx'), true)
  assert.match(String(req.file.path), /students\.xlsx$/i)
})

test('validateUploadedSpreadsheet rejects spoofed spreadsheet uploads before any disk write', async () => {
  const writeCalls = []
  const { validateUploadedSpreadsheet } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    fs: {
      promises: {
        writeFile: async (...args) => {
          writeCalls.push(args)
        },
        unlink: async () => {}
      }
    },
    'file-type': {
      fileTypeFromBuffer: async () => ({
        ext: 'png',
        mime: 'image/png'
      })
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
      originalname: 'students.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('not-a-real-sheet')
    }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedSpreadsheet(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, {
    message: 'Invalid file: content does not match a valid spreadsheet format'
  })
  assert.equal(writeCalls.length, 0)
})

test('validateUploadedSpreadsheet allows CSV files when content is plain text', async () => {
  const writeCalls = []
  const { validateUploadedSpreadsheet } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    fs: {
      promises: {
        writeFile: async (filePath, buffer) => {
          writeCalls.push({ filePath, buffer: Buffer.from(buffer) })
        },
        unlink: async () => {}
      }
    },
    'file-type': {
      fileTypeFromBuffer: async () => undefined
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
      originalname: 'students.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from('name,email\nTest User,test@example.com\n', 'utf8')
    }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedSpreadsheet(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, true)
  assert.equal(writeCalls.length, 1)
  assert.match(writeCalls[0].filePath, /students\.csv$/i)
})

test('validateUploadedSpreadsheet rejects CSV files with invalid UTF-8 byte sequences', async () => {
  const writeCalls = []
  const { validateUploadedSpreadsheet } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    fs: {
      promises: {
        writeFile: async (filePath, buffer) => {
          writeCalls.push({ filePath, buffer: Buffer.from(buffer) })
        },
        unlink: async () => {}
      }
    },
    'file-type': {
      fileTypeFromBuffer: async () => undefined
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
      originalname: 'students.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from([0x6e, 0x61, 0x6d, 0x65, 0x2c, 0x65, 0x6d, 0x61, 0x69, 0x6c, 0x0a, 0xc3, 0x28])
    }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedSpreadsheet(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, {
    message: 'Invalid file: content does not match a valid spreadsheet format'
  })
  assert.equal(writeCalls.length, 0)
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
    '../utils/audit': {
      recordAuditLog: async () => {}
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
  assert.match(res.sentFile.options.headers['Content-Disposition'], /^attachment; filename="assignment\.pdf"$/i)
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

test('importStudents sanitizes spreadsheet row values before reporting validation failures', async () => {
  const { importStudents } = loadWithMocks(resolveFromTest('src', 'controllers', 'admin.controller.js'), {
    '../utils/prisma': {
      department: {
        findMany: async () => ([
          { name: 'BCA', code: 'BCA' }
        ])
      },
      user: {
        findMany: async () => []
      },
      student: {
        findMany: async () => []
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
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
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
      Workbook: class MockWorkbook {
        constructor() {
          this.worksheets = [{
            rowCount: 2,
            getRow: (rowNumber) => {
              if (rowNumber === 1) {
                return {
                  cellCount: 6,
                  getCell: (index) => ({
                    text: ['Name', 'Email', 'Student ID', 'Department', 'Semester', 'Section'][index - 1]
                  })
                }
              }

              return {
                getCell: (index) => ({
                  text: [
                    '<img src=x onerror=1>A',
                    'student@example.com',
                    'stu-001',
                    'BCA',
                    '1',
                    '<b>A</b>'
                  ][index - 1]
                })
              }
            }
          }]
          this.csv = {
            readFile: async () => {}
          }
          this.xlsx = {
            readFile: async () => {}
          }
        }
      }
    }
  })

  const req = {
    file: {
      path: 'students.csv',
      originalname: 'students.csv'
    },
    user: { id: 'admin-1', role: 'ADMIN' }
  }
  const res = createResponse()

  await importStudents(req, res)

  assert.equal(res.statusCode, 400)
  assert.equal(res.body.summary.failed, 1)
  assert.equal(res.body.failures[0].name, 'A')
  assert.equal(res.body.failures[0].message, 'Name must be at least 2 characters long')
})

test('uploadImage rejects files with image-looking filenames when the MIME type is not an image', async () => {
  const { uploadImage } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
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
  app.post('/upload-avatar', uploadImage.single('avatar'), (_req, res) => {
    res.status(201).json({ ok: true })
  })

  const response = await request(app)
    .post('/upload-avatar')
    .attach('avatar', Buffer.from('not really an image'), {
      filename: 'shell.php.png',
      contentType: 'text/plain'
    })

  assert.equal(response.status, 400)
  assert.deepEqual(response.body, { message: 'Only image files are allowed' })
})
