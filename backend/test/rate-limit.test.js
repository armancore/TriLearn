const test = require('node:test')
const assert = require('node:assert/strict')

const modulePath = require.resolve('../src/middleware/rateLimit.middleware')

const loadRateLimitUtils = () => {
  delete require.cache[modulePath]
  return require(modulePath)
}

test('forgotPasswordRateLimitKey combines IP and normalized email address', () => {
  const { forgotPasswordRateLimitKey } = loadRateLimitUtils()

  const key = forgotPasswordRateLimitKey({
    ip: '203.0.113.5',
    body: {
      email: ' Teacher@School.edu '
    }
  })

  assert.match(key, /203\.0\.113\.5/)
  assert.match(key, /teacher@school\.edu$/)
})
