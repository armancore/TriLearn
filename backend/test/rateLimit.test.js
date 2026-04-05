const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const request = require('supertest')

process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const {
  studentQrScanLimiter,
  staffStudentIdScanLimiter
} = require('../src/middleware/rateLimit.middleware')

const buildApp = (middleware, user) => {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = user
    next()
  })
  app.post('/limited', middleware, (_req, res) => {
    res.status(201).json({ ok: true })
  })
  return app
}

test('studentQrScanLimiter throttles repeated scans per student user', async () => {
  const app = buildApp(studentQrScanLimiter, { id: 'student-rate-limit-1', role: 'STUDENT' })

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await request(app).post('/limited').send({ qrData: 'signed-qr' })
    assert.equal(response.status, 201)
  }

  const blocked = await request(app).post('/limited').send({ qrData: 'signed-qr' })

  assert.equal(blocked.status, 429)
  assert.deepEqual(blocked.body, {
    message: 'Too many attendance QR scan attempts, please wait a moment and try again'
  })
})

test('staffStudentIdScanLimiter throttles repeated scans per staff user', async () => {
  const app = buildApp(staffStudentIdScanLimiter, { id: 'staff-rate-limit-1', role: 'GATEKEEPER' })

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request(app).post('/limited').send({ qrData: 'student-id-qr' })
    assert.equal(response.status, 201)
  }

  const blocked = await request(app).post('/limited').send({ qrData: 'student-id-qr' })

  assert.equal(blocked.status, 429)
  assert.deepEqual(blocked.body, {
    message: 'Too many student ID scan attempts, please wait a moment and try again'
  })
})
