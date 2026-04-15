const test = require('node:test')
const assert = require('node:assert/strict')

const validateEnv = require('../src/utils/validateEnv')

const withPatchedExit = async (fn) => {
  const originalExit = process.exit
  const exitCalls = []

  process.exit = (code) => {
    exitCalls.push(code)
    throw new Error(`process.exit:${code}`)
  }

  try {
    await fn(exitCalls)
  } finally {
    process.exit = originalExit
  }
}

const withPatchedConsoleError = async (fn) => {
  const originalError = console.error
  const errorCalls = []

  console.error = (...args) => {
    errorCalls.push(args.join(' '))
  }

  try {
    await fn(errorCalls)
  } finally {
    console.error = originalError
  }
}

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/trilearn',
  JWT_SECRET: 'jwt-secret',
  LOGIN_CAPTCHA_SECRET: 'captcha-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  QR_SIGNING_SECRET: 'qr-secret',
  FRONTEND_URL: 'http://localhost:5173',
  NODE_ENV: 'development'
}

const restoreEnv = (snapshot) => {
  Object.keys(process.env).forEach((key) => {
    if (!(key in snapshot)) {
      delete process.env[key]
    }
  })

  Object.entries(snapshot).forEach(([key, value]) => {
    process.env[key] = value
  })
}

test('validateEnv rejects invalid NODE_ENV values', async () => {
  const originalEnv = { ...process.env }
  Object.assign(process.env, baseEnv, { NODE_ENV: 'staging' })

  try {
    await withPatchedConsoleError(async (errorCalls) => {
      await withPatchedExit(async (exitCalls) => {
        assert.throws(() => validateEnv(), /process\.exit:1/)
        assert.deepEqual(exitCalls, [1])
        assert.match(errorCalls[0], /Invalid NODE_ENV value: staging/)
      })
    })
  } finally {
    restoreEnv(originalEnv)
  }
})

test('validateEnv rejects disabling rate limits in production', async () => {
  const originalEnv = { ...process.env }
  Object.assign(process.env, baseEnv, {
    NODE_ENV: 'production',
    REDIS_URL: 'redis://localhost:6379',
    MAIL_FROM: 'TriLearn <no-reply@example.com>',
    RESEND_SMTP_HOST: 'smtp.resend.com',
    RESEND_SMTP_PORT: '465',
    RESEND_SMTP_USER: 'resend',
    RESEND_SMTP_PASS: 'secret',
    DISABLE_RATE_LIMITS: 'true'
  })

  try {
    await withPatchedConsoleError(async (errorCalls) => {
      await withPatchedExit(async (exitCalls) => {
        assert.throws(() => validateEnv(), /process\.exit:1/)
        assert.deepEqual(exitCalls, [1])
        assert.match(errorCalls[0], /DISABLE_RATE_LIMITS=true is not allowed in production/)
      })
    })
  } finally {
    restoreEnv(originalEnv)
  }
})

test('validateEnv rejects enabling debug errors in production', async () => {
  const originalEnv = { ...process.env }
  Object.assign(process.env, baseEnv, {
    NODE_ENV: 'production',
    REDIS_URL: 'redis://localhost:6379',
    MAIL_FROM: 'TriLearn <no-reply@example.com>',
    RESEND_SMTP_HOST: 'smtp.resend.com',
    RESEND_SMTP_PORT: '465',
    RESEND_SMTP_USER: 'resend',
    RESEND_SMTP_PASS: 'secret',
    DEBUG_ERRORS: 'true'
  })

  try {
    await withPatchedConsoleError(async (errorCalls) => {
      await withPatchedExit(async (exitCalls) => {
        assert.throws(() => validateEnv(), /process\.exit:1/)
        assert.deepEqual(exitCalls, [1])
        assert.match(errorCalls[0], /DEBUG_ERRORS=true is not allowed in production/)
      })
    })
  } finally {
    restoreEnv(originalEnv)
  }
})

test('validateEnv rejects invalid ENABLE_PASSWORD_RESET values', async () => {
  const originalEnv = { ...process.env }
  Object.assign(process.env, baseEnv, {
    ENABLE_PASSWORD_RESET: 'True'
  })

  try {
    await withPatchedConsoleError(async (errorCalls) => {
      await withPatchedExit(async (exitCalls) => {
        assert.throws(() => validateEnv(), /process\.exit:1/)
        assert.deepEqual(exitCalls, [1])
        assert.match(errorCalls[0], /ENABLE_PASSWORD_RESET must be set to "true" or "false"/)
      })
    })
  } finally {
    restoreEnv(originalEnv)
  }
})

test('validateEnv accepts explicit ENABLE_PASSWORD_RESET boolean strings', () => {
  const originalEnv = { ...process.env }
  Object.assign(process.env, baseEnv, {
    ENABLE_PASSWORD_RESET: 'false'
  })

  try {
    assert.doesNotThrow(() => validateEnv())
  } finally {
    restoreEnv(originalEnv)
  }
})

test('validateEnv rejects invalid ALLOW_SOCKET_NO_ORIGIN values', async () => {
  const originalEnv = { ...process.env }
  Object.assign(process.env, baseEnv, {
    ALLOW_SOCKET_NO_ORIGIN: 'yes'
  })

  try {
    await withPatchedConsoleError(async (errorCalls) => {
      await withPatchedExit(async (exitCalls) => {
        assert.throws(() => validateEnv(), /process\.exit:1/)
        assert.deepEqual(exitCalls, [1])
        assert.match(errorCalls[0], /ALLOW_SOCKET_NO_ORIGIN must be set to "true" or "false"/)
      })
    })
  } finally {
    restoreEnv(originalEnv)
  }
})

test('validateEnv rejects ALLOW_SOCKET_NO_ORIGIN=true in production', async () => {
  const originalEnv = { ...process.env }
  Object.assign(process.env, baseEnv, {
    NODE_ENV: 'production',
    REDIS_URL: 'redis://localhost:6379',
    MAIL_FROM: 'TriLearn <no-reply@example.com>',
    RESEND_SMTP_HOST: 'smtp.resend.com',
    RESEND_SMTP_PORT: '465',
    RESEND_SMTP_USER: 'resend',
    RESEND_SMTP_PASS: 'secret',
    ALLOW_SOCKET_NO_ORIGIN: 'true'
  })

  try {
    await withPatchedConsoleError(async (errorCalls) => {
      await withPatchedExit(async (exitCalls) => {
        assert.throws(() => validateEnv(), /process\.exit:1/)
        assert.deepEqual(exitCalls, [1])
        assert.match(errorCalls[0], /ALLOW_SOCKET_NO_ORIGIN=true is not allowed in production/)
      })
    })
  } finally {
    restoreEnv(originalEnv)
  }
})
