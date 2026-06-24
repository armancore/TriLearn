const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')
const express = require('express')
const request = require('supertest')
const { z } = require('zod')

// Ensure env vars are set before any src modules load
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret'.repeat(3)
process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test-csrf-secret'.repeat(3)
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret'.repeat(3)
process.env.QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || 'test-qr-secret'.repeat(3)
process.env.LOGIN_CAPTCHA_SECRET = process.env.LOGIN_CAPTCHA_SECRET || 'test-login-captcha'.repeat(3)
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const { validate } = require('../src/middleware/validate.middleware')
const { buildServiceContext } = require('../src/utils/controllerAdapter')

// ──────────────────────────────────────────────────────────────
// Helper: build a small isolated Express app with a single GET
// route protected by the REAL validate middleware.
// ──────────────────────────────────────────────────────────────
const buildTestApp = (schema, handler) => {
  const app = express()
  app.get('/test', validate(schema), (req, res) => {
    const ctx = buildServiceContext(req)
    handler(ctx, res)
  })
  return app
}

// ──────────────────────────────────────────────────────────────
// TASK 2a — validate middleware query coercion
// Verifies the fix from Task 1: req.validatedQuery carries the
// Zod-transformed value; buildServiceContext picks it up.
// ──────────────────────────────────────────────────────────────

test('validate middleware coerces query string to number via z.coerce.number()', async () => {
  const schema = {
    query: z.object({
      count: z.coerce.number()
    })
  }

  let received
  const app = buildTestApp(schema, (ctx, res) => {
    received = ctx.query
    res.json({ ok: true })
  })

  await request(app).get('/test?count=42')
  assert.strictEqual(typeof received.count, 'number', 'count should be a number after coercion')
  assert.strictEqual(received.count, 42)
})

test('validate middleware applies .default() when query param is absent', async () => {
  const schema = {
    query: z.object({
      page: z.coerce.number().default(1)
    })
  }

  let received
  const app = buildTestApp(schema, (ctx, res) => {
    received = ctx.query
    res.json({ ok: true })
  })

  await request(app).get('/test')
  assert.strictEqual(received.page, 1, 'page should default to 1 when absent')
})

test('validate middleware applies .transform().pipe() to produce an array from a CSV string', async () => {
  // UUID v4 format: third segment starts with 4, fourth segment starts with 8/9/a/b
  const id1 = '12345678-1234-4234-8234-123456789012'
  const id2 = '12345678-1234-4234-9234-123456789012'

  const schema = {
    query: z.object({
      subjectIds: z.string()
        .trim()
        .min(1)
        .transform((value) => value.split(',').map((s) => s.trim()).filter(Boolean))
        .pipe(z.array(z.string().uuid()).min(1))
    })
  }

  let received
  const app = buildTestApp(schema, (ctx, res) => {
    received = ctx.query
    res.json({ ok: true })
  })

  await request(app).get(`/test?subjectIds=${id1},${id2}`)
  assert.ok(Array.isArray(received.subjectIds), 'subjectIds should be an array, not a raw string')
  assert.deepEqual(received.subjectIds, [id1, id2])
})

test('validate middleware returns 400 when query fails schema validation', async () => {
  const schema = {
    query: z.object({
      count: z.coerce.number().positive()
    })
  }

  const app = buildTestApp(schema, (_ctx, res) => res.json({ ok: true }))

  const res = await request(app).get('/test?count=-5')
  assert.strictEqual(res.status, 400)
  assert.strictEqual(res.body.message, 'Validation failed')
})

// ──────────────────────────────────────────────────────────────
// TASK 2b — getBulkAttendanceSummary integration with real validate
//
// Mounts the REAL attendance route with a prisma stub so no DB
// is needed. Verifies that the CSV subjectIds param is coerced
// into an array before it reaches the service.
// ──────────────────────────────────────────────────────────────

const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)

const loadWithMocks = (targetPath, mocks) => {
  const modulePath = resolveFromTest(targetPath)
  const localRequire = createRequire(modulePath)
  const touched = []

  for (const [requestPath, mockExports] of Object.entries(mocks)) {
    const resolved = localRequire.resolve(requestPath)
    touched.push({ resolved, previous: require.cache[resolved] })
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
      if (previous) require.cache[resolved] = previous
      else delete require.cache[resolved]
    })
  }
}

// UUID v4 format: third segment starts with 4, fourth segment starts with 8/9/a/b
const SUB1 = 'a1b2c3d4-e5f6-4a7b-8c9d-a1b2c3d4e5f6'
const SUB2 = 'b2c3d4e5-f6a7-4b8c-9d0e-b2c3d4e5f6a7'
const INSTRUCTOR_ID = 'c3d4e5f6-a7b8-4c9d-ae0f-c3d4e5f6a7b8'

test('GET /attendance/bulk-summary passes subjectIds as an array to the service (real validate middleware)', async () => {
  const subjectFindManyCalls = []

  const { getBulkAttendanceSummary: serviceFn } = loadWithMocks(
    'src/services/attendance/attendance.service.js',
    {
      '../../utils/prisma': {
        subject: {
          findMany: async (args) => {
            subjectFindManyCalls.push(args)
            // Return subjects as if instructor owns both
            return [{ id: SUB1 }, { id: SUB2 }]
          }
        },
        attendance: {
          findMany: async () => []
        }
      }
    }
  )

  const { createController } = require('../src/utils/controllerAdapter')
  const { validate } = require('../src/middleware/validate.middleware')
  const { schemas } = require('../src/validators/schemas')

  const app = express()

  // Inject an instructor user matching INSTRUCTOR_ID so allowRoles passes
  app.use((req, _res, next) => {
    req.user = { id: 'user-1', role: 'INSTRUCTOR', isActive: true }
    req.instructor = { id: INSTRUCTOR_ID, department: 'BCA' }
    next()
  })

  app.get(
    '/api/v1/attendance/bulk-summary',
    validate(schemas.attendance.bulkSummary),
    createController(serviceFn)
  )

  const encodedIds = encodeURIComponent(`${SUB1},${SUB2}`)
  const res = await request(app)
    .get(`/api/v1/attendance/bulk-summary?subjectIds=${encodedIds}`)

  assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`)

  // Confirm the prisma call received an array, not a raw string
  assert.strictEqual(subjectFindManyCalls.length, 1, 'subject.findMany should be called once')
  const inClause = subjectFindManyCalls[0]?.where?.id?.in
  assert.ok(Array.isArray(inClause), 'subject filter id.in should be an array')
  assert.deepEqual(inClause.sort(), [SUB1, SUB2].sort())
})

test('GET /attendance/bulk-summary returns 400 for invalid (non-UUID) subjectIds', async () => {
  const { validate } = require('../src/middleware/validate.middleware')
  const { schemas } = require('../src/validators/schemas')

  const app = express()

  app.use((req, _res, next) => {
    req.user = { id: 'user-1', role: 'INSTRUCTOR', isActive: true }
    req.instructor = { id: INSTRUCTOR_ID, department: 'BCA' }
    next()
  })

  // Handler should never be reached — validate rejects the request
  app.get(
    '/api/v1/attendance/bulk-summary',
    validate(schemas.attendance.bulkSummary),
    (_req, res) => res.json({ ok: true })
  )

  const res = await request(app)
    .get('/api/v1/attendance/bulk-summary?subjectIds=not-a-valid-uuid%2Calso-not-a-uuid')

  assert.strictEqual(res.status, 400)
  assert.strictEqual(res.body.message, 'Validation failed')
})
