const test = require('node:test')
const assert = require('node:assert/strict')
const { isKnownWeakPassword } = require('../src/utils/security')
const { strongPasswordSchema } = require('../src/validators/schemas')

test('isKnownWeakPassword blocks expanded common password list entries', () => {
  const weakPasswords = [
    'password',
    'Student123',
    'Qwerty123',
    'Abc@1234',
    'Nepal@123',
    'Welcome2026',
    'TriLearn123'
  ]

  weakPasswords.forEach((password) => {
    assert.equal(isKnownWeakPassword(password), true, password)
  })
})

test('isKnownWeakPassword allows non-dictionary passphrases', () => {
  assert.equal(isKnownWeakPassword('RiverCobaltLantern42'), false)
})

test('strongPasswordSchema rejects common passwords that otherwise meet format rules', () => {
  const result = strongPasswordSchema.safeParse('Qwerty123')

  assert.equal(result.success, false)
  assert.equal(
    result.error.issues.some((issue) => issue.message === 'Password is too common. Please choose a stronger password'),
    true
  )
})
