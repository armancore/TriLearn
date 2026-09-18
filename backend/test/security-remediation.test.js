const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')
const { createServiceResponder } = require('../src/utils/serviceResult')

const load = (name, prisma, extras = {}) => {
  const file = path.resolve(__dirname, '../src/services', name + '.js')
  const localRequire = createRequire(file)
  const before = new Map(Object.entries(require.cache))
  const mocks = {
    '../utils/prisma': prisma,
    '../utils/audit': { recordAuditLog: async () => {} },
    '../utils/fileStorage': { buildUploadedFileUrl: () => '/uploads/test.pdf', uploadPath: __dirname, getFileBuffer: async () => Buffer.from('file') },
    '../utils/uploadRecords': { attachUploadedFileToEntity: async () => {} },
    '../middleware/upload.middleware': { removeUploadedFile: async () => {} },
    ...extras
  }
  for (const [request, exports] of Object.entries(mocks)) {
    const id = localRequire.resolve(request)
    require.cache[id] = { id, filename: id, loaded: true, exports }
  }
  delete require.cache[file]
  try { return require(file) } finally {
    for (const id of Object.keys(require.cache)) {
      if (id.includes(`${path.sep}src${path.sep}`) || Object.values(mocks).includes(require.cache[id]?.exports)) {
        if (before.has(id)) require.cache[id] = before.get(id)
        else delete require.cache[id]
      }
    }
  }
}
const call = async (fn, context) => {
  const result = createServiceResponder()
  const response = (await fn(context, result)) || result.toServiceResult()
  return { ...response, statusCode: response.statusCode || 200 }
}
const coordinator = { user: { id: 'coord', role: 'COORDINATOR', coordinator: { department: 'CS' } }, coordinator: { department: 'CS' }, query: {}, params: {}, body: {} }

test('assignment listing scopes both results and count, including a foreign subject filter', async () => {
  const queries = []
  const { getAllAssignments } = load('assignment.service', { assignment: {
    findMany: async ({ where }) => { queries.push(where); return [] },
    count: async ({ where }) => { queries.push(where); return 0 }
  } })
  await call(getAllAssignments, { ...coordinator, query: { subjectId: 'foreign' } })
  assert.deepEqual(queries, Array(2).fill({ subjectId: 'foreign', subject: { department: 'CS' } }))
  assert.equal((await call(getAllAssignments, { ...coordinator, coordinator: null })).statusCode, 403)
  queries.length = 0
  await call(getAllAssignments, { ...coordinator, user: { role: 'ADMIN' } })
  assert.deepEqual(queries, [{}, {}])
})

test('all attached file types enforce coordinator department even for the original uploader', async () => {
  for (const entityType of ['ASSIGNMENT', 'SUBMISSION', 'TASK', 'TASK_SUBMISSION', 'STUDY_MATERIAL']) {
    let department = 'Foreign'
    const entity = { id: 'entity', subjectId: 'subject', instructorId: 'teacher', studentId: 'student', assignment: { subjectId: 'subject', instructorId: 'teacher' }, task: { subjectId: 'subject', instructorId: 'teacher' } }
    const prisma = {
      uploadedFile: { findUnique: async () => ({ uploadedById: 'coord', entityType, entityId: 'entity' }) },
      subject: { findUnique: async () => ({ department }) },
      ...Object.fromEntries(['assignment', 'submission', 'task', 'taskSubmission', 'studyMaterial'].map(name => [name, { findUnique: async () => entity }]))
    }
    const { serveUploadedFile } = load('upload.service', prisma)
    const context = { ...coordinator, params: { filename: 'test.pdf' } }
    assert.equal((await call(serveUploadedFile, context)).statusCode, 403, entityType)
    department = 'CS'
    assert.notEqual((await call(serveUploadedFile, context)).statusCode, 403, entityType)
    assert.equal((await call(serveUploadedFile, { ...context, user: { ...coordinator.user, coordinator: null } })).statusCode, 403)
  }
})

test('material create/delete and both list routes use the parent subject department', async () => {
  let department = 'Foreign'
  let writes = 0
  const queries = []
  const svc = load('studyMaterial.service', {
    subject: { findUnique: async () => ({ department, instructorId: 'teacher' }) },
    studyMaterial: {
      findUnique: async () => ({ id: 'material', subject: { department } }),
      create: async () => { writes++; return { id: 'material' } },
      delete: async () => { writes++ },
      findMany: async ({ where }) => { queries.push(where); return [] }, count: async () => 0
    }
  })
  const context = { ...coordinator, body: { subjectId: 'subject', title: 'Title', description: 'Description' }, params: { id: 'material', subjectId: 'subject' } }
  assert.equal((await call(svc.createMaterial, context)).statusCode, 403)
  assert.equal((await call(svc.deleteMaterial, context)).statusCode, 403)
  assert.equal(writes, 0)
  department = 'CS'
  assert.equal((await call(svc.createMaterial, context)).statusCode, 201)
  await call(svc.deleteMaterial, context)
  assert.equal(writes, 2)
  await call(svc.getAllMaterials, context)
  await call(svc.getMaterialsBySubject, context)
  assert.ok(queries.every(where => where.subject.department === 'CS'))
})

test('student subject details omit peers while staff keep the roster and counts', async () => {
  const { getSubjectById } = load('subject.service', {
    student: { findUnique: async () => ({ id: 'student' }) },
    subject: { findFirst: async ({ include }) => ({ id: 'subject', _count: { enrollments: 2 }, ...(include.enrollments ? { enrollments: [{ student: { fatherPhone: 'private' } }] } : {}) }) }
  })
  const student = await call(getSubjectById, { user: { id: 'user', role: 'STUDENT' }, params: { id: 'subject' } })
  assert.equal(student.body.subject.enrollments, undefined)
  assert.equal(student.body.subject._count.enrollments, 2)
  const staff = await call(getSubjectById, { user: { role: 'ADMIN' }, params: { id: 'subject' } })
  assert.equal(staff.body.subject.enrollments.length, 1)
})

test('instructor profile tickets stay in assigned subjects; admin retains full history', async () => {
  const tickets = [{ id: 'own', attendance: { subjectId: 'own-subject' } }, { id: 'foreign', attendance: { subjectId: 'foreign-subject' } }]
  const svc = load('studentProfile.service', {
    student: { findFirst: async () => ({ id: 'student', user: { id: 'user' } }) },
    subject: { findMany: async () => [{ id: 'own-subject' }] },
    ...Object.fromEntries(['attendance', 'mark', 'submission', 'taskSubmission', 'disciplinaryRecord'].map(name => [name, { findMany: async () => [] }])),
    absenceTicket: { findMany: async ({ where }) => tickets.filter(t => !where.attendance || where.attendance.subjectId.in.includes(t.attendance.subjectId)) }
  })
  const context = { user: { id: 'teacher-user', role: 'INSTRUCTOR' }, instructor: { id: 'teacher' }, params: { studentId: 'student' } }
  assert.deepEqual((await call(svc.getStudentProfile, context)).body.absenceTickets.map(t => t.id), ['own'])
  assert.equal((await call(svc.getStudentProfile, { ...context, user: { role: 'ADMIN' } })).body.absenceTickets.length, 2)
})

test('profile completion rejects changed section, accepts unchanged or omitted section without writing it', async () => {
  const writes = []
  const tx = { user: { update: async () => ({ id: 'user' }) }, student: { update: async ({ data }) => writes.push(data) } }
  const svc = load('auth.profile.service', {
    student: { findUnique: async () => ({ section: 'A' }) }, $transaction: async fn => fn(tx)
  })
  const body = { phone: '9800000000', fatherName: 'Father', motherName: 'Mother', fatherPhone: '9800000000', motherPhone: '9800000000', localGuardianName: 'Guardian', localGuardianAddress: 'Address', localGuardianPhone: '9800000000', permanentAddress: 'Address', temporaryAddress: 'Address', dateOfBirth: '2005-01-01', section: 'B' }
  const context = { user: { id: 'user', role: 'STUDENT' }, body }
  assert.equal((await call(svc.completeProfile, context)).statusCode, 403)
  assert.equal(writes.length, 0)
  for (const section of ['A', undefined]) {
    assert.equal((await call(svc.completeProfile, { ...context, body: { ...body, section } })).statusCode, 200)
  }
  assert.equal(writes.length, 2)
  assert.ok(writes.every(data => !Object.prototype.hasOwnProperty.call(data, 'section')))
})

test('import polling denies foreign and unrelated jobs before reading their state', async () => {
  let job = { id: '1', name: 'bulk-student-import', data: { user: { id: 'other' } }, getState: async () => { throw new Error('must not read state') } }
  const { getStudentImportJob } = load('bulkImport.service', {}, {
    '../jobs/notificationQueue': { BULK_STUDENT_IMPORT_JOB: 'bulk-student-import', notificationQueue: { getJob: async () => job } }
  })
  const context = { ...coordinator, params: { jobId: '1' } }
  assert.equal((await call(getStudentImportJob, context)).statusCode, 404)
  job = { ...job, name: 'send-email', data: { user: { id: 'coord' } } }
  assert.equal((await call(getStudentImportJob, context)).statusCode, 404)
  assert.equal((await call(getStudentImportJob, { ...context, user: { role: 'ADMIN' } })).statusCode, 404)
  job = { ...job, name: 'bulk-student-import', getState: async () => 'completed', returnvalue: { summary: 'own' } }
  assert.equal((await call(getStudentImportJob, context)).body.result.summary, 'own')
  assert.equal((await call(getStudentImportJob, { ...context, user: { role: 'ADMIN' } })).statusCode, 200)
})

test('password change commits password cutoff and refresh revocation in one transaction', async () => {
  const calls = []
  const tx = { user: { update: async (args) => { calls.push(args); return { id: 'user' } } }, refreshToken: { updateMany: async args => { calls.push(args); return { count: 2 } } } }
  const svc = load('auth.account.service', {
    user: { findUnique: async () => ({ id: 'user', password: 'hash' }) },
    $transaction: async (fn, options) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(tx) }
  }, {
    bcryptjs: { compare: async p => p === 'CurrentPass123!' },
    '../utils/security': { hashPassword: async () => 'new-hash', isKnownWeakPassword: () => false },
    '../utils/accessTokenRevocation': { revokeAccessTokenFromRequest: async () => true }
  })
  assert.equal((await call(svc.changePassword, { user: { id: 'user' }, body: { currentPassword: 'CurrentPass123!', newPassword: 'NewPassword123!' } })).statusCode, 200)
  assert.ok(calls[0].data.passwordChangedAt instanceof Date)
  assert.deepEqual(calls[1].where, { userId: 'user', revokedAt: null })
})

test('refresh rotation rejects concurrent consumption and password cutoffs, but accepts a live session', async () => {
  let count = 0
  let passwordChangedAt = null
  let created = 0
  const tx = {
    user: { findUnique: async () => ({ isActive: true, passwordChangedAt }) },
    refreshToken: { updateMany: async () => ({ count }), create: async () => { created++ } }
  }
  const { issueAuthSession } = load('session.service', { $transaction: async (fn, options) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(tx) } }, {
    '../utils/token': { signAccessToken: () => 'access', signRefreshToken: () => 'refresh', verifyRefreshToken: () => ({ iat: 100 }), hashToken: v => v, getRefreshTokenExpiry: () => new Date(Date.now() + 1000) },
    '../utils/accessTokenRevocation': { trackAccessToken: async () => {} }
  })
  const issue = () => issueAuthSession({ id: 'user' }, {}, { get: () => '' }, 'old', { setRefreshCookie: false })
  await assert.rejects(issue, /no longer valid/)
  count = 1
  passwordChangedAt = new Date(100_000)
  await assert.rejects(issue, /no longer valid/)
  assert.equal(created, 0)
  passwordChangedAt = null
  assert.equal((await issue()).refreshToken, 'refresh')
  assert.equal(created, 1)
})

test('native logout revokes supplied refresh token, and web logout still uses its cookie', async () => {
  const tokens = []
  const svc = load('auth.session.service', { refreshToken: { updateMany: async ({ where }) => tokens.push(where.tokenHash) } }, {
    '../utils/token': { hashToken: v => v, getRefreshCookieOptions: () => ({}), getAccessCookieOptions: () => ({}), ACCESS_TOKEN_COOKIE_NAME: 'accessToken' },
    '../utils/accessTokenRevocation': { revokeAccessTokenFromRequest: async () => true },
    '../middleware/csrf.middleware': { clearCsrfCookie: () => {} }
  })
  await call(svc.logout, { get: () => 'mobile', body: { refreshToken: 'native-refresh' }, cookies: {} })
  await call(svc.logout, { get: () => '', body: { refreshToken: 'ignored-body' }, cookies: { refreshToken: 'web-refresh' } })
  assert.deepEqual(tokens, ['native-refresh', 'web-refresh'])
})

test('login authenticated against an old password cannot issue after a concurrent password change', async () => {
  let storedPassword = 'new-hash'
  let created = 0
  const tx = {
    user: { findUnique: async () => ({ id: 'user', isActive: true, password: storedPassword }) },
    refreshToken: { create: async () => { created++ } }
  }
  const { issueAuthSession } = load('session.service', { $transaction: async fn => fn(tx) }, {
    '../utils/token': { signAccessToken: () => 'access', signRefreshToken: () => 'refresh', hashToken: v => v, getRefreshTokenExpiry: () => new Date(Date.now() + 1000) },
    '../utils/accessTokenRevocation': { trackAccessToken: async () => {} }
  })
  const login = () => issueAuthSession({ id: 'user', password: 'old-hash' }, {}, { get: () => '' }, null, { setRefreshCookie: false })
  await assert.rejects(login, /no longer valid/)
  assert.equal(created, 0)
  storedPassword = 'old-hash'
  await login()
  assert.equal(created, 1)
})
