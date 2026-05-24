const test = require('node:test')
const assert = require('node:assert/strict')

const logger = require('../src/utils/logger')
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

const withPatchedLoggerError = async (fn) => {
  const originalError = logger.error
  const errorCalls = []

  logger.error = (...args) => {
    errorCalls.push(args.join(' '))
  }

  try {
    await fn(errorCalls)
  } finally {
    logger.error = originalError
  }
}

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/trilearn',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  LOGIN_CAPTCHA_SECRET: 'c'.repeat(32),
  JWT_REFRESH_SECRET: 'r'.repeat(32),
  QR_SIGNING_SECRET: 'q'.repeat(32),
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
    await withPatchedLoggerError(async (errorCalls) => {
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

test('validateEnv requires JWT_ACCESS_SECRET even when JWT_SECRET is set', async () => {
  const originalEnv = { ...process.env }
  const envWithoutAccessSecret = { ...baseEnv }
  delete envWithoutAccessSecret.JWT_ACCESS_SECRET

  Object.assign(process.env, envWithoutAccessSecret, {
    JWT_SECRET: 'legacy-secret'
  })
  delete process.env.JWT_ACCESS_SECRET

  try {
    await withPatchedLoggerError(async (errorCalls) => {
      await withPatchedExit(async (exitCalls) => {
        assert.throws(() => validateEnv(), /process\.exit:1/)
        assert.deepEqual(exitCalls, [1])
        assert.match(errorCalls[0], /Missing required env vars: JWT_ACCESS_SECRET/)
      })
    })
  } finally {
    restoreEnv(originalEnv)
  }
})

test('validateEnv requires LOGIN_CAPTCHA_SECRET', () => {
  const originalEnv = { ...process.env }
  const envWithoutCaptchaSecret = { ...baseEnv }
  delete envWithoutCaptchaSecret.LOGIN_CAPTCHA_SECRET

  Object.assign(process.env, envWithoutCaptchaSecret)
  delete process.env.LOGIN_CAPTCHA_SECRET

  try {
    assert.throws(
      () => validateEnv(),
      /LOGIN_CAPTCHA_SECRET is required\. Generate with: openssl rand -hex 32/
    )
  } finally {
    restoreEnv(originalEnv)
  }
})

test('validateEnv rejects disabling rate limits in production', () => {
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
    assert.throws(
      () => validateEnv(),
      /FATAL: DISABLE_RATE_LIMITS=true is not permitted in production\. Remove this variable or set it to false\./
    )
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
    assert.throws(
      () => validateEnv(),
      /FATAL: DEBUG_ERRORS=true exposes internal error details to clients\. This must not be enabled in production\./
    )
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
    await withPatchedLoggerError(async (errorCalls) => {
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
    await withPatchedLoggerError(async (errorCalls) => {
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
    await withPatchedLoggerError(async (errorCalls) => {
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

test('validateEnv rejects TRUST_PROXY=true in production', () => {
  const originalEnv = { ...process.env }
  Object.assign(process.env, baseEnv, {
    NODE_ENV: 'production',
    REDIS_URL: 'redis://localhost:6379',
    MAIL_FROM: 'TriLearn <no-reply@example.com>',
    RESEND_SMTP_HOST: 'smtp.resend.com',
    RESEND_SMTP_PORT: '465',
    RESEND_SMTP_USER: 'resend',
    RESEND_SMTP_PASS: 'secret',
    TRUST_PROXY: 'true'
  })

  try {
    assert.throws(
      () => validateEnv(),
      /FATAL: TRUST_PROXY=true allows X-Forwarded-For spoofing/
    )
  } finally {
    restoreEnv(originalEnv)
  }
})

test('validateEnv requires private S3-compatible storage in production', () => {
  const originalEnv = { ...process.env }
  Object.assign(process.env, baseEnv, {
    NODE_ENV: 'production',
    REDIS_URL: 'redis://localhost:6379',
    MAIL_FROM: 'TriLearn <no-reply@example.com>',
    RESEND_SMTP_HOST: 'smtp.resend.com',
    RESEND_SMTP_PORT: '465',
    RESEND_SMTP_USER: 'resend',
    RESEND_SMTP_PASS: 'secret'
  })
  delete process.env.S3_BUCKET
  delete process.env.S3_REGION
  delete process.env.S3_ACCESS_KEY
  delete process.env.S3_SECRET_KEY

  try {
    assert.throws(
      () => validateEnv(),
      /FATAL: Missing S3 env vars: S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY\. Production uploads require private S3\/R2 storage\./
    )
  } finally {
    restoreEnv(originalEnv)
  }
})

test('validateEnv rejects known secret placeholders in production by throwing', () => {
  const originalEnv = { ...process.env }
  Object.assign(process.env, baseEnv, {
    NODE_ENV: 'production',
    REDIS_URL: 'redis://localhost:6379',
    MAIL_FROM: 'TriLearn <no-reply@example.com>',
    RESEND_SMTP_HOST: 'smtp.resend.com',
    RESEND_SMTP_PORT: '465',
    RESEND_SMTP_USER: 'resend',
    RESEND_SMTP_PASS: 'secret',
    JWT_ACCESS_SECRET: 'REPLACE_WITH_OUTPUT_OF__openssl_rand_hex_64'
  })

  try {
    assert.throws(
      () => validateEnv(),
      /FATAL: JWT_ACCESS_SECRET contains a placeholder value\. Generate real secrets before deploying\./
    )
  } finally {
    restoreEnv(originalEnv)
  }
})

test('validateEnv rejects short secret values', async () => {
  const originalEnv = { ...process.env }
  Object.assign(process.env, baseEnv, {
    QR_SIGNING_SECRET: 'short'
  })

  try {
    await withPatchedLoggerError(async (errorCalls) => {
      await withPatchedExit(async (exitCalls) => {
        assert.throws(() => validateEnv(), /process\.exit:1/)
        assert.deepEqual(exitCalls, [1])
        assert.match(errorCalls[0], /QR_SIGNING_SECRET must be at least 32 characters long/)
      })
    })
  } finally {
    restoreEnv(originalEnv)
  }
})
