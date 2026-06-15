const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const request = require('supertest')
const { generateCsrfToken } = require('../src/middleware/csrf.middleware')

const testDatabaseUrl = process.env.TEST_DATABASE_URL

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required to run backend real-database tests')
}

process.env.DATABASE_URL = testDatabaseUrl
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret'.repeat(3)
process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test-csrf-secret'.repeat(3)
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret'.repeat(3)
process.env.QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || 'test-qr-secret'.repeat(3)
process.env.LOGIN_CAPTCHA_SECRET = process.env.LOGIN_CAPTCHA_SECRET || 'test-login-captcha-secret'.repeat(2)
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
process.env.NODE_ENV = process.env.NODE_ENV || 'test'
process.env.DISABLE_RATE_LIMITS = 'true'

const trustedOrigin = process.env.FRONTEND_URL
const { app } = require('../src/index')
const prisma = require('../src/utils/prisma')

const buildStudentIntakePayload = (email) => ({
  fullName: 'DB Test Student',
  email,
  phone: '9800000000',
  fatherName: 'Father Example',
  motherName: 'Mother Example',
  fatherPhone: '9800000001',
  motherPhone: '9800000002',
  bloodGroup: 'A+',
  localGuardianName: 'Guardian Example',
  localGuardianAddress: 'Kathmandu',
  localGuardianPhone: '9800000003',
  permanentAddress: 'Bhaktapur',
  temporaryAddress: 'Lalitpur',
  dateOfBirth: '2005-01-01',
  preferredDepartment: 'BCA'
})

const cleanupStudentIntakeRecords = async (email) => {
  await prisma.studentApplication.deleteMany({ where: { email } })
  await prisma.user.deleteMany({ where: { email } })
}

const createCsrfAgent = async () => {
  const agent = request.agent(app)
  const csrfToken = generateCsrfToken()
  assert.match(csrfToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)

  return {
    agent,
    csrfToken
  }
}

test.after(async () => {
  await prisma.$disconnect()
})

test('POST /api/v1/auth/student-intake persists an application in the real database', async () => {
  const email = `db-intake-${crypto.randomUUID()}@example.com`

  await cleanupStudentIntakeRecords(email)

  try {
    const { agent, csrfToken } = await createCsrfAgent()
    const response = await agent
      .post('/api/v1/auth/student-intake')
      .set('Origin', trustedOrigin)
      .set('Cookie', [`csrfToken=${csrfToken}`])
      .set('X-CSRF-Token', csrfToken)
      .send(buildStudentIntakePayload(email))

    assert.equal(response.status, 200)
    assert.equal(response.body.message, 'If this email is eligible, you will receive further instructions.')

    const saved = await prisma.studentApplication.findUnique({
      where: { email }
    })

    assert.ok(saved)
    assert.equal(saved.email, email)
    assert.equal(saved.status, 'PENDING')
    assert.equal(saved.preferredDepartment, 'BCA')
  } finally {
    await cleanupStudentIntakeRecords(email)
  }
})

test('POST /api/v1/auth/student-intake resets a reviewed application back to pending in the real database', async () => {
  const email = `db-reviewed-${crypto.randomUUID()}@example.com`

  await cleanupStudentIntakeRecords(email)

  try {
    await prisma.studentApplication.create({
      data: {
        fullName: 'Old Student',
        email,
        phone: '9800000099',
        fatherName: 'Old Father',
        motherName: 'Old Mother',
        fatherPhone: '9800000098',
        motherPhone: '9800000097',
        localGuardianName: 'Old Guardian',
        localGuardianAddress: 'Old Address',
        localGuardianPhone: '9800000096',
        permanentAddress: 'Old Permanent',
        temporaryAddress: 'Old Temporary',
        dateOfBirth: new Date('2004-02-02'),
        preferredDepartment: 'BIM',
        preferredSemester: 1,
        preferredSection: 'A',
        status: 'REVIEWED',
        reviewedAt: new Date(),
        reviewedBy: 'reviewer-1'
      }
    })

    const { agent, csrfToken } = await createCsrfAgent()
    const response = await agent
      .post('/api/v1/auth/student-intake')
      .set('Origin', trustedOrigin)
      .set('Cookie', [`csrfToken=${csrfToken}`])
      .set('X-CSRF-Token', csrfToken)
      .send(buildStudentIntakePayload(email))

    assert.equal(response.status, 200)
    assert.equal(response.body.message, 'If this email is eligible, you will receive further instructions.')

    const updated = await prisma.studentApplication.findUnique({
      where: { email }
    })

    assert.ok(updated)
    assert.equal(updated.status, 'PENDING')
    assert.equal(updated.reviewedAt, null)
    assert.equal(updated.reviewedBy, null)
    assert.equal(updated.preferredDepartment, 'BCA')
    assert.equal(updated.fullName, 'DB Test Student')
  } finally {
    await cleanupStudentIntakeRecords(email)
  }
})
