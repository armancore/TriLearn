if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line n/no-unpublished-require
  require('dotenv').config()
}

const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')

const parseInteger = (/** @type {string | undefined} */ value, /** @type {number} */ fallback) => {
  const parsed = parseInt(value || "", 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const parseBoolean = (/** @type {string | null | undefined} */ value, /** @type {boolean} */ fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  return String(value).trim().toLowerCase() === 'true'
}

const normalizeCertificate = (/** @type {string | undefined} */ value) => String(value || '').replace(/\\n/g, '\n').trim()

const applyPgSslCaCertificate = (/** @type {import("tls").ConnectionOptions} */ sslOptions) => {
  const ca = normalizeCertificate(process.env.PGSSL_CA_CERT)
  if (ca) {
    sslOptions.ca = ca
  }

  return sslOptions
}

const buildConnectionOptions = (/** @type {string | URL | undefined} */ connectionString) => {
  /** @type {import("pg").PoolConfig} */
  const options = { connectionString: connectionString?.toString() }

  try {
    const parsedUrl = new URL(connectionString || "")
    const sslMode = String(parsedUrl.searchParams.get('sslmode') || '').toLowerCase()

    if (sslMode === 'require' || sslMode === 'no-verify') {
      parsedUrl.searchParams.delete('sslmode')
      options.connectionString = parsedUrl.toString()
      options.ssl = applyPgSslCaCertificate({
        rejectUnauthorized: sslMode === 'no-verify'
          ? parseBoolean(process.env.PGSSL_REJECT_UNAUTHORIZED, false)
          : parseBoolean(process.env.PGSSL_REJECT_UNAUTHORIZED, true)
      })
    }
  } catch {
    if (process.env.PGSSL_REJECT_UNAUTHORIZED !== undefined || process.env.PGSSL_CA_CERT) {
      options.ssl = applyPgSslCaCertificate({
        rejectUnauthorized: parseBoolean(process.env.PGSSL_REJECT_UNAUTHORIZED, true)
      })
    }
  }

  return options
}

const pool = new Pool({
  ...buildConnectionOptions(process.env.DATABASE_URL),
  max: parseInteger(process.env.PGPOOL_MAX, 10),
  min: parseInteger(process.env.PGPOOL_MIN, 0),
  idleTimeoutMillis: parseInteger(process.env.PGPOOL_IDLE_TIMEOUT_MS, 10000),
  connectionTimeoutMillis: parseInteger(process.env.PGPOOL_CONNECTION_TIMEOUT_MS, 10000),
  maxUses: parseInteger(process.env.PGPOOL_MAX_USES, 0),
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

module.exports = prisma
