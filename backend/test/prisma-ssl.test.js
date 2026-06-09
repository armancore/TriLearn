const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')

const prismaPath = path.resolve(__dirname, '..', 'src', 'utils', 'prisma.js')

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

const loadPrismaWithPoolCapture = (envPatch) => {
  const originalEnv = { ...process.env }
  delete process.env.PGSSL_REJECT_UNAUTHORIZED
  delete process.env.PGSSL_CA_CERT
  Object.assign(process.env, {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/trilearn'
  }, envPatch)

  const localRequire = createRequire(prismaPath)
  const mocks = {
    '@prisma/client': {
      PrismaClient: class PrismaClient {
        constructor(options) {
          this.options = options
        }
      }
    },
    '@prisma/adapter-pg': {
      PrismaPg: class PrismaPg {
        constructor(pool) {
          this.pool = pool
        }
      }
    }
  }
  let capturedPoolOptions

  class Pool {
    constructor(options) {
      capturedPoolOptions = options
    }
  }

  mocks.pg = { Pool }

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

  delete require.cache[prismaPath]

  try {
    require(prismaPath)
    return capturedPoolOptions
  } finally {
    delete require.cache[prismaPath]
    touched.forEach(({ resolved, previous }) => {
      if (previous) {
        require.cache[resolved] = previous
      } else {
        delete require.cache[resolved]
      }
    })
    restoreEnv(originalEnv)
  }
}

test('Prisma Postgres pool validates TLS certificates by default for sslmode=require', () => {
  const options = loadPrismaWithPoolCapture({
    DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/trilearn?sslmode=require'
  })

  assert.equal(options.ssl.rejectUnauthorized, true)
  assert.equal(new URL(options.connectionString).searchParams.has('sslmode'), false)
})

test('Prisma Postgres pool allows explicit local TLS validation opt-out', () => {
  const options = loadPrismaWithPoolCapture({
    DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/trilearn?sslmode=require',
    PGSSL_REJECT_UNAUTHORIZED: 'false'
  })

  assert.equal(options.ssl.rejectUnauthorized, false)
})

test('Prisma Postgres pool treats sslmode=no-verify as an explicit opt-out', () => {
  const options = loadPrismaWithPoolCapture({
    DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/trilearn?sslmode=no-verify'
  })

  assert.equal(options.ssl.rejectUnauthorized, false)
  assert.equal(new URL(options.connectionString).searchParams.has('sslmode'), false)
})

test('Prisma Postgres pool trusts configured CA certificate for Supabase TLS verification', () => {
  const ca = [
    '-----BEGIN CERTIFICATE-----',
    'test-ca',
    '-----END CERTIFICATE-----'
  ].join('\\n')

  const options = loadPrismaWithPoolCapture({
    DATABASE_URL: 'postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require',
    PGSSL_CA_CERT: ca
  })

  assert.equal(options.ssl.rejectUnauthorized, true)
  assert.equal(options.ssl.ca, ca.replace(/\\n/g, '\n'))
})
