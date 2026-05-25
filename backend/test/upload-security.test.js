const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')
const express = require('express')
const request = require('supertest')
const { PDFDocument, PDFName } = require('pdf-lib')

const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)

const loadWithMocks = (targetPath, mocks) => {
  const modulePath = path.resolve(targetPath)
  const localRequire = createRequire(modulePath)
  const sourceRoot = resolveFromTest('src')
  const previousCacheKeys = new Set(Object.keys(require.cache))
  const touched = []

  const mockEntries = Object.entries(mocks)
  if (mocks['./department.controller']) {
    mockEntries.push(['../services/department.service', mocks['./department.controller']])
  }

  for (const [request, mockExports] of mockEntries) {
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
    on() {
      return this
    },
    once() {
      return this
    },
    emit() {
      return true
    },
    write(chunk) {
      const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      this.body = this.body ? Buffer.concat([this.body, nextChunk]) : nextChunk
      return true
    },
    end(chunk) {
      if (chunk) {
        this.write(chunk)
      }
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

test('serveUploadedFile denies direct uploaded file access to non-owners', async () => {
  const auditCalls = []
  const { serveUploadedFile } = loadWithMocks(resolveFromTest('src', 'controllers', 'upload.controller.js'), {
    '../utils/prisma': {
      uploadedFile: {
        findUnique: async () => ({ id: 'file-1', uploadedById: 'owner-user-1' })
      },
      user: { findFirst: async () => null },
      assignment: { findFirst: async () => null },
      submission: { findFirst: async () => null },
      studyMaterial: { findFirst: async () => null }
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
    params: { filename: 'private.pdf' },
    user: { id: 'different-user', role: 'STUDENT' }
  }
  const res = createResponse()

  await serveUploadedFile(req, res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { message: 'Access denied' })
  assert.equal(res.sentFile, null)
  assert.equal(auditCalls.length, 1)
  assert.equal(auditCalls[0].metadata.resourceType, 'UPLOAD')
})

test('serveUploadedFile allows direct uploaded file access to the owner', async () => {
  const { serveUploadedFile } = loadWithMocks(resolveFromTest('src', 'controllers', 'upload.controller.js'), {
    '../utils/prisma': {
      uploadedFile: {
        findUnique: async () => ({ id: 'file-1', uploadedById: 'owner-user-1' })
      },
      user: { findFirst: async () => null },
      assignment: { findFirst: async () => null },
      submission: { findFirst: async () => null },
      studyMaterial: { findFirst: async () => null }
    },
    '../utils/fileStorage': {
      uploadPath: 'C:\\uploads',
      uploadPublicPath: '/api/v1/uploads'
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../middleware/csrf.middleware': {
      getTrustedOrigins: () => []
    }
  })

  const req = {
    params: { filename: 'private.pdf' },
    user: { id: 'owner-user-1', role: 'STUDENT' }
  }
  const res = createResponse()

  await serveUploadedFile(req, res)

  assert.equal(res.statusCode, 200)
  assert.match(res.sentFile.filePath, /private\.pdf$/i)
  assert.match(res.headers['Content-Disposition'], /^attachment; filename="private\.pdf"$/i)
})

test('serveUploadedFile allows uploaded assignment file access through parent entity enrollment', async () => {
  const legacyLookupCalls = []
  const { serveUploadedFile } = loadWithMocks(resolveFromTest('src', 'controllers', 'upload.controller.js'), {
    '../utils/prisma': {
      uploadedFile: {
        findUnique: async () => ({
          id: 'file-1',
          uploadedById: 'instructor-user-1',
          entityType: 'ASSIGNMENT',
          entityId: 'assignment-1'
        })
      },
      assignment: {
        findUnique: async () => ({
          id: 'assignment-1',
          subjectId: 'subject-1',
          instructorId: 'instructor-1'
        }),
        findFirst: async () => {
          legacyLookupCalls.push('assignment.findFirst')
          return null
        }
      },
      subjectEnrollment: {
        findUnique: async (payload) => (
          payload.where.subjectId_studentId.subjectId === 'subject-1' &&
          payload.where.subjectId_studentId.studentId === 'student-1'
            ? { id: 'enrollment-1' }
          : null
        )
      },
      user: {
        findFirst: async () => {
          legacyLookupCalls.push('user.findFirst')
          return null
        }
      },
      submission: {
        findFirst: async () => {
          legacyLookupCalls.push('submission.findFirst')
          return null
        }
      },
      studyMaterial: {
        findFirst: async () => {
          legacyLookupCalls.push('studyMaterial.findFirst')
          return null
        }
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
      getTrustedOrigins: () => []
    }
  })

  const req = {
    params: { filename: 'assignment.pdf' },
    user: {
      id: 'student-user-1',
      role: 'STUDENT',
      student: { id: 'student-1' }
    }
  }
  const res = createResponse()

  await serveUploadedFile(req, res)

  assert.equal(res.statusCode, 200)
  assert.match(res.sentFile.filePath, /assignment\.pdf$/i)
  assert.deepEqual(legacyLookupCalls, [])
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

test('validateUploadedPdf strips active PDF content and stores the sanitized buffer', async () => {
  const writeCalls = []
  const removedAnnotationIndexes = []
  let formFlattened = false
  const sanitizedPdfBuffer = Buffer.from('%PDF-1.7 sanitized payload')
  const deletedKeysByDict = {}
  const createPdfDict = (label, values = {}) => ({
    has: (key) => Object.prototype.hasOwnProperty.call(values, key),
    get: (key) => values[key],
    delete: (key) => {
      deletedKeysByDict[label] = deletedKeysByDict[label] || []
      deletedKeysByDict[label].push(key)
      delete values[key]
    },
    entries: () => Object.entries(values)
  })
  const catalogNames = createPdfDict('names', {
    JavaScript: createPdfDict('javascriptNames'),
    EmbeddedFiles: createPdfDict('embeddedFiles')
  })
  const catalog = createPdfDict('catalog', {
    OpenAction: createPdfDict('openAction', { JS: 'app.alert(1)' }),
    AA: createPdfDict('catalogAdditionalActions', { JS: 'app.alert(2)' }),
    AF: 'embedded-file-ref',
    Names: catalogNames
  })
  const formDict = createPdfDict('form', {
    XFA: 'xfa-payload',
    AA: createPdfDict('formAdditionalActions', { JS: 'app.alert(3)' })
  })
  const fieldDict = createPdfDict('field', {
    Action: createPdfDict('fieldAction', { JS: 'app.alert(4)' })
  })
  const annotations = [
    createPdfDict('annotationWithAdditionalActions', { AA: createPdfDict('annotationAction') }),
    createPdfDict('annotationWithJavaScript', { JS: 'app.alert(5)' }),
    createPdfDict('safeAnnotation', {})
  ]

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
      PDFName: {
        of: (name) => name
      },
      PDFDocument: {
        load: async () => ({
          context: {
            lookup: (object) => object
          },
          catalog,
          getPages: () => [{
            node: {
              get: (key) => key === 'Annots'
                ? {
                    asArray: () => annotations,
                    lookup: (index) => annotations[index],
                    remove: (index) => {
                      removedAnnotationIndexes.push(index)
                      annotations.splice(index, 1)
                    }
                  }
                : undefined
            }
          }],
          getForm: () => ({
            acroForm: {
              dict: formDict
            },
            getFields: () => [{
              acroField: {
                dict: fieldDict
              }
            }],
            flatten: () => {
              formFlattened = true
            }
          }),
          save: async () => sanitizedPdfBuffer
        })
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
      buffer: Buffer.from('%PDF-1.7 active payload')
    }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedPdf(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, true)
  assert.deepEqual(removedAnnotationIndexes, [])
  assert.deepEqual(deletedKeysByDict.catalog, ['OpenAction', 'AA', 'AF', 'XFA', 'A', 'Action', 'AA', 'JS', 'XFA'])
  assert.deepEqual(deletedKeysByDict.names, ['JavaScript', 'EmbeddedFiles', 'A', 'Action', 'AA', 'JS', 'XFA'])
  assert.deepEqual(deletedKeysByDict.form, ['XFA', 'A', 'Action', 'AA', 'JS', 'XFA'])
  assert.deepEqual(deletedKeysByDict.field, ['A', 'Action', 'AA', 'JS', 'XFA'])
  assert.equal(formFlattened, true)
  assert.deepEqual(req.file.buffer, sanitizedPdfBuffer)
  assert.equal(writeCalls.length, 1)
  assert.deepEqual(writeCalls[0].buffer, sanitizedPdfBuffer)
})

test('validateUploadedPdf stores embedded JavaScript PDFs with the JavaScript stripped', async () => {
  const writeCalls = []
  const sourcePdf = await PDFDocument.create()
  sourcePdf.addPage()
  sourcePdf.addJavaScript('evil', 'app.alert("owned")')
  const sourceBuffer = Buffer.from(await sourcePdf.save({ useObjectStreams: false }))

  assert.match(sourceBuffer.toString('latin1'), /\/JavaScript/)
  assert.match(sourceBuffer.toString('latin1'), /006100700070002E0061006C006500720074/i)

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
      originalname: 'javascript.pdf',
      mimetype: 'application/pdf',
      buffer: sourceBuffer
    }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedPdf(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, true)
  assert.equal(writeCalls.length, 1)

  const storedBuffer = writeCalls[0].buffer
  const storedRaw = storedBuffer.toString('latin1')
  const storedPdf = await PDFDocument.load(storedBuffer)
  const names = storedPdf.catalog.lookup(PDFName.of('Names'))

  assert.equal(names?.get?.(PDFName.of('JavaScript')), undefined)
  assert.doesNotMatch(storedRaw, /006100700070002E0061006C006500720074/i)
  assert.doesNotMatch(storedRaw, /\/JS\s/)
  assert.doesNotMatch(storedRaw, /\/JavaScript/)
})

test('validateUploadedPdf records uploaded file ownership after storage', async () => {
  const upsertCalls = []
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
    '../utils/prisma': {
      uploadedFile: {
        upsert: async (payload) => {
          upsertCalls.push(payload)
        }
      }
    },
    '../utils/fileStorage': {
      uploadPath: 'C:\\uploads',
      isS3Configured: () => false
    }
  })

  const req = {
    user: { id: 'uploader-1' },
    file: {
      originalname: 'assignment.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7 valid payload')
    }
  }
  const res = createResponse()

  await validateUploadedPdf(req, res, () => {})

  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].create.uploadedById, 'uploader-1')
  assert.equal(upsertCalls[0].create.storage, 'LOCAL')
  assert.match(upsertCalls[0].where.fileName, /assignment\.pdf$/i)
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
        png() {
          return this
        },
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
  assert.equal(req.file.mimetype, 'image/png')
})

test('validateUploadedImage re-encodes GIF uploads to PNG before object storage', async () => {
  const uploadCalls = []
  const upsertCalls = []
  const reencodedPng = Buffer.from('reencoded-png')
  const { validateUploadedImage } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    fs: {
      promises: {
        unlink: async () => {}
      }
    },
    sharp: (input) => ({
      rotate: () => ({
        png() {
          return this
        },
        toBuffer: async () => {
          assert.equal(Buffer.from(input).subarray(0, 6).toString('ascii'), 'GIF89a')
          return reencodedPng
        }
      })
    }),
    '../utils/logger': {
      error: () => {}
    },
    '../utils/prisma': {
      uploadedFile: {
        upsert: async (payload) => {
          upsertCalls.push(payload)
        }
      }
    },
    '../utils/fileStorage': {
      uploadPath: 'C:\\uploads',
      isS3Configured: () => true,
      uploadFile: async (buffer, fileName, mimeType) => {
        uploadCalls.push({ buffer, fileName, mimeType })
        return { url: `https://storage.test/${fileName}` }
      }
    }
  })

  const req = {
    user: { id: 'uploader-1' },
    file: {
      originalname: 'avatar.gif',
      mimetype: 'image/gif',
      buffer: Buffer.concat([
        Buffer.from('GIF89a'),
        Buffer.from('<html><script>alert(1)</script>')
      ])
    }
  }
  const res = createResponse()
  let nextCalled = false

  await validateUploadedImage(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, true)
  assert.equal(uploadCalls.length, 1)
  assert.equal(uploadCalls[0].buffer, reencodedPng)
  assert.equal(uploadCalls[0].mimeType, 'image/png')
  assert.equal(uploadCalls[0].fileName.endsWith('-avatar.png'), true)
  assert.equal(req.file.filename.endsWith('-avatar.png'), true)
  assert.equal(req.file.mimetype, 'image/png')
  assert.equal(upsertCalls[0].create.mimeType, 'image/png')
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

test('removeUploadedFile resolves traversal-looking input inside uploadPath', async () => {
  const unlinkCalls = []
  const uploadDir = path.join('C:', 'uploads')
  const { removeUploadedFile } = loadWithMocks(resolveFromTest('src', 'middleware', 'upload.middleware.js'), {
    fs: {
      promises: {
        unlink: async (filePath) => {
          unlinkCalls.push(filePath)
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
      uploadPath: uploadDir
    }
  })

  await removeUploadedFile('../../../etc/passwd')

  assert.equal(unlinkCalls.length, 1)
  assert.equal(unlinkCalls[0], path.resolve(path.join(uploadDir, 'passwd')))
  assert.equal(
    unlinkCalls.every((filePath) => (
      filePath.startsWith(path.resolve(uploadDir) + path.sep) ||
      filePath === path.resolve(uploadDir)
    )),
    true
  )
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
  assert.equal(res.headers['Cache-Control'], 'private, no-store')
  assert.match(res.headers['Content-Disposition'], /^attachment; filename="assignment\.pdf"$/i)
  assert.match(res.headers['Content-Security-Policy'], /sandbox allow-scripts allow-downloads/)
  assert.equal(res.sentFile.options.headers['Content-Type'], 'application/pdf')
  assert.match(res.sentFile.options.headers['Content-Disposition'], /^attachment; filename="assignment\.pdf"$/i)
})

test('serveUploadedFile proxies S3-backed uploads instead of redirecting to storage', async () => {
  const { serveUploadedFile } = loadWithMocks(resolveFromTest('src', 'controllers', 'upload.controller.js'), {
    '../utils/prisma': {
      user: {
        findFirst: async () => ({ id: 'avatar-owner-1' })
      },
      assignment: {
        findFirst: async () => null
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
      uploadPublicPath: '/api/v1/uploads',
      getFileBuffer: async () => Buffer.from('image-bytes')
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../middleware/csrf.middleware': {
      getTrustedOrigins: () => ['https://trilearn-arman.vercel.app']
    }
  })

  const req = {
    params: { filename: 'avatar.jpeg' },
    user: { id: 'avatar-owner-1', role: 'STUDENT' }
  }
  const res = createResponse()

  await serveUploadedFile(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers.Location, undefined)
  assert.equal(res.headers['Content-Type'], 'image/jpeg')
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
      generateTemporaryPassword: () => 'TempPass123!',
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
      generateTemporaryPassword: () => 'TempPass123!',
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
                    '<img src=x onerror=1>=A',
                    'student@example.com',
                    'stu-001',
                    'BCA',
                    '99',
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
  assert.equal(res.body.failures[0].name, "'=A")
  assert.equal(res.body.failures[0].message, 'Semester must be a number between 1 and 8')
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
