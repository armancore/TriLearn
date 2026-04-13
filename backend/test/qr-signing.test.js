const test = require('node:test')
const assert = require('node:assert/strict')

const modulePath = require.resolve('../src/utils/qrSigning')

const loadQrSigningUtils = () => {
  delete require.cache[modulePath]
  return require(modulePath)
}

test('signQrPayload includes the configured active kid and verifyQrPayload accepts it', () => {
  const previousKeys = process.env.QR_SIGNING_SECRET_KEYS
  const previousActiveKid = process.env.QR_SIGNING_ACTIVE_KID
  const previousLegacySecret = process.env.QR_SIGNING_SECRET

  process.env.QR_SIGNING_SECRET = 'legacy-secret'
  process.env.QR_SIGNING_SECRET_KEYS = 'current:current-secret,previous:previous-secret'
  process.env.QR_SIGNING_ACTIVE_KID = 'current'

  try {
    const { signQrPayload, verifyQrPayload } = loadQrSigningUtils()
    const signed = signQrPayload({ type: 'ATTENDANCE', subjectId: 'subject-1' })
    const parsed = JSON.parse(signed)
    const verified = verifyQrPayload(signed)

    assert.equal(parsed.kid, 'current')
    assert.deepEqual(verified, {
      kid: 'current',
      payload: { type: 'ATTENDANCE', subjectId: 'subject-1' }
    })
  } finally {
    if (previousKeys === undefined) delete process.env.QR_SIGNING_SECRET_KEYS
    else process.env.QR_SIGNING_SECRET_KEYS = previousKeys

    if (previousActiveKid === undefined) delete process.env.QR_SIGNING_ACTIVE_KID
    else process.env.QR_SIGNING_ACTIVE_KID = previousActiveKid

    if (previousLegacySecret === undefined) delete process.env.QR_SIGNING_SECRET
    else process.env.QR_SIGNING_SECRET = previousLegacySecret
  }
})

test('verifyQrPayload accepts legacy QR payloads without a kid during rotation', () => {
  const previousKeys = process.env.QR_SIGNING_SECRET_KEYS
  const previousActiveKid = process.env.QR_SIGNING_ACTIVE_KID
  const previousLegacySecret = process.env.QR_SIGNING_SECRET

  process.env.QR_SIGNING_SECRET = 'legacy-secret'
  process.env.QR_SIGNING_SECRET_KEYS = 'current:current-secret'
  process.env.QR_SIGNING_ACTIVE_KID = 'current'

  try {
    const crypto = require('node:crypto')
    const { verifyQrPayload } = loadQrSigningUtils()
    const payload = {
      type: 'STUDENT_ID_CARD',
      studentId: 'student-1',
      expiresAt: '2026-12-31T00:00:00.000Z'
    }
    const signature = crypto
      .createHmac('sha256', 'legacy-secret')
      .update(JSON.stringify(payload))
      .digest('hex')

    const verified = verifyQrPayload(JSON.stringify({ payload, signature }))

    assert.deepEqual(verified, {
      kid: null,
      payload
    })
  } finally {
    if (previousKeys === undefined) delete process.env.QR_SIGNING_SECRET_KEYS
    else process.env.QR_SIGNING_SECRET_KEYS = previousKeys

    if (previousActiveKid === undefined) delete process.env.QR_SIGNING_ACTIVE_KID
    else process.env.QR_SIGNING_ACTIVE_KID = previousActiveKid

    if (previousLegacySecret === undefined) delete process.env.QR_SIGNING_SECRET
    else process.env.QR_SIGNING_SECRET = previousLegacySecret
  }
})
