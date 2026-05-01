const test = require('node:test')
const assert = require('node:assert/strict')

const tokenModulePath = require.resolve('../src/utils/token')

const loadTokenUtils = () => {
  delete require.cache[tokenModulePath]
  return require(tokenModulePath)
}

test('signAccessToken embeds the access token type', () => {
  process.env.JWT_SECRET = 'test-access-secret'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'
  process.env.ACCESS_TOKEN_EXPIRES_IN = '15m'

  const { signAccessToken } = loadTokenUtils()
  const token = signAccessToken({ id: 'user-1', role: 'STUDENT' })
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))

  assert.equal(payload.type, 'access')
  assert.equal(payload.id, 'user-1')
  assert.equal(payload.role, 'STUDENT')
  assert.equal(typeof payload.jti, 'string')
  assert.ok(payload.jti.length > 0)
})

test('signRefreshToken and verifyRefreshToken round-trip refresh tokens', () => {
  process.env.JWT_SECRET = 'test-access-secret'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'
  process.env.REFRESH_TOKEN_EXPIRES_DAYS = '7'

  const { signRefreshToken, verifyRefreshToken } = loadTokenUtils()
  const token = signRefreshToken({ id: 'user-9', role: 'ADMIN' })
  const decoded = verifyRefreshToken(token)

  assert.equal(decoded.type, 'refresh')
  assert.equal(decoded.id, 'user-9')
  assert.equal(decoded.role, 'ADMIN')
  assert.equal(typeof decoded.jti, 'string')
  assert.ok(decoded.jti.length > 0)
})

test('signRefreshToken generates unique tokens for rapid successive refreshes', () => {
  process.env.JWT_SECRET = 'test-access-secret'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'
  process.env.REFRESH_TOKEN_EXPIRES_DAYS = '7'

  const { signRefreshToken } = loadTokenUtils()
  const firstToken = signRefreshToken({ id: 'user-9', role: 'ADMIN' })
  const secondToken = signRefreshToken({ id: 'user-9', role: 'ADMIN' })

  assert.notEqual(firstToken, secondToken)
})

test('hashToken is deterministic and produces a sha256 digest', () => {
  const { hashToken } = loadTokenUtils()

  const left = hashToken('sample-token')
  const right = hashToken('sample-token')

  assert.equal(left, right)
  assert.equal(left.length, 64)
  assert.match(left, /^[a-f0-9]+$/)
})

test('getRefreshCookieOptions keeps localhost development cookies non-secure', () => {
  const { getRefreshCookieOptions } = loadTokenUtils()

  const cookieOptions = getRefreshCookieOptions({
    secure: false,
    hostname: 'localhost',
    headers: {
      host: 'localhost:5173'
    }
  })

  assert.equal(cookieOptions.secure, false)
  assert.equal(cookieOptions.sameSite, 'lax')
})

test('getRefreshCookieOptions keeps private network development cookies non-secure', () => {
  const { getRefreshCookieOptions } = loadTokenUtils()

  const cookieOptions = getRefreshCookieOptions({
    secure: false,
    hostname: '192.168.1.22',
    headers: {
      host: '192.168.1.22:5000',
      'x-forwarded-proto': 'http'
    }
  })

  assert.equal(cookieOptions.secure, false)
  assert.equal(cookieOptions.sameSite, 'lax')
})

test('getRefreshCookieOptions forces secure cookies for non-local hosts even outside production', () => {
  const { getRefreshCookieOptions } = loadTokenUtils()

  const cookieOptions = getRefreshCookieOptions({
    secure: false,
    hostname: 'staging.school.edu',
    headers: {
      host: 'staging.school.edu',
      'x-forwarded-proto': 'http'
    }
  })

  assert.equal(cookieOptions.secure, true)
  assert.equal(cookieOptions.sameSite, 'none')
})

test('getRefreshCookieOptions respects forwarded https when behind a proxy', () => {
  const { getRefreshCookieOptions } = loadTokenUtils()

  const cookieOptions = getRefreshCookieOptions({
    secure: false,
    hostname: 'school.edu',
    headers: {
      host: 'school.edu',
      'x-forwarded-proto': 'https'
    }
  })

  assert.equal(cookieOptions.secure, true)
  assert.equal(cookieOptions.sameSite, 'none')
})
