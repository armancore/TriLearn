const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')

const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)

const loadWithMocks = (targetPath, mocks) => {
  const modulePath = path.resolve(targetPath)
  const localRequire = createRequire(modulePath)
  const touched = []

  for (const [requestPath, mockExports] of Object.entries(mocks)) {
    const resolved = localRequire.resolve(requestPath)
    touched.push({
      resolved,
      previous: require.cache[resolved]
    })
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
      if (previous) {
        require.cache[resolved] = previous
      } else {
        delete require.cache[resolved]
      }
    })
  }
}

const buildWinstonMock = () => {
  class ConsoleTransport {
    constructor(options = {}) {
      this.name = 'console'
      this.options = options
    }
  }

  class FileTransport {
    constructor(options = {}) {
      this.name = 'file'
      this.options = options
    }
  }

  const format = (transform) => () => ({ transform })
  format.combine = (...parts) => parts
  format.timestamp = () => 'timestamp'
  format.json = () => 'json'

  return {
    createLogger: (options) => options,
    format,
    transports: {
      Console: ConsoleTransport,
      File: FileTransport
    }
  }
}

test('logger uses stdout only in production', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  let mkdirCalls = 0

  try {
    const logger = loadWithMocks(resolveFromTest('src', 'utils', 'logger.js'), {
      fs: {
        mkdirSync: () => {
          mkdirCalls += 1
        }
      },
      winston: buildWinstonMock()
    })

    assert.equal(logger.level, 'warn')
    assert.equal(mkdirCalls, 0)
    assert.equal(logger.transports.length, 1)
    assert.equal(logger.transports[0].name, 'console')
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
  }
})

test('logger keeps the file transport outside production', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  let mkdirCalls = 0

  try {
    const logger = loadWithMocks(resolveFromTest('src', 'utils', 'logger.js'), {
      fs: {
        mkdirSync: () => {
          mkdirCalls += 1
        }
      },
      winston: buildWinstonMock()
    })

    assert.equal(logger.level, 'debug')
    assert.equal(mkdirCalls, 1)
    assert.equal(logger.transports.length, 2)
    assert.deepEqual(logger.transports.map((transport) => transport.name), ['console', 'file'])
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
  }
})

test('logger redacts refresh tokens and other sensitive request body fields', async () => {
  const logger = loadWithMocks(resolveFromTest('src', 'utils', 'logger.js'), {
    fs: {
      mkdirSync: () => {}
    },
    winston: buildWinstonMock()
  })

  const payload = {
    body: {
      refreshToken: 'raw-refresh-token',
      accessToken: 'raw-access-token',
      nested: {
        password: 'secret-password'
      },
      email: 'student@example.com'
    }
  }

  const sanitized = logger.sanitizeLogMeta(payload)

  assert.equal(sanitized.body.refreshToken, logger.REDACTED)
  assert.equal(sanitized.body.accessToken, logger.REDACTED)
  assert.equal(sanitized.body.nested.password, logger.REDACTED)
  assert.equal(sanitized.body.email, 'student@example.com')
})
