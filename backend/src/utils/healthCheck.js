const prisma = require('./prisma')
const { getReadyRedisClient, isRedisConfigured } = require('./redis')
const { isPrivateIpv4, isPrivateIpv6, normalizeIpAddress } = require('./network')

const HEALTHCHECK_KEY_HEADER = 'x-health-check-key'
const DEFAULT_HEALTHCHECK_CACHE_TTL_MS = 60_000
let cachedHealthCheck = null

const parseCacheTtlMs = () => {
  const configured = Number.parseInt(process.env.HEALTHCHECK_CACHE_TTL_MS || '', 10)
  if (Number.isFinite(configured) && configured >= 0) {
    return configured
  }

  return DEFAULT_HEALTHCHECK_CACHE_TTL_MS
}

const isPrivateHealthCheckRequest = (req) => {
  const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress)

  return isPrivateIpv4(ip) || isPrivateIpv6(ip)
}

const hasValidHealthCheckKey = (req) => {
  const configuredKey = String(process.env.HEALTHCHECK_KEY || '').trim()
  if (!configuredKey) {
    return false
  }

  return String(req.get(HEALTHCHECK_KEY_HEADER) || '').trim() === configuredKey
}

const isHealthCheckRequestAllowed = (req) => {
  if (process.env.NODE_ENV !== 'production') {
    return true
  }

  return isPrivateHealthCheckRequest(req) || hasValidHealthCheckKey(req)
}

const checkPostgres = async () => {
  await prisma.$queryRaw`SELECT 1`
}

const checkRedis = async () => {
  if (!isRedisConfigured()) {
    return
  }

  const redis = await getReadyRedisClient({ context: 'health check' })
  if (!redis) {
    throw new Error('Redis is unavailable')
  }

  await redis.ping()
}

const shouldCheckDependencies = () => (
  process.env.NODE_ENV !== 'test' ||
  String(process.env.HEALTHCHECK_CHECK_DEPENDENCIES || '').trim() === 'true'
)

const runHealthChecks = async () => {
  if (!shouldCheckDependencies()) {
    return
  }

  const cacheTtlMs = parseCacheTtlMs()
  const now = Date.now()
  if (
    cacheTtlMs > 0 &&
    cachedHealthCheck &&
    cachedHealthCheck.expiresAt > now
  ) {
    if (cachedHealthCheck.error) {
      throw cachedHealthCheck.error
    }
    return
  }

  try {
    await checkPostgres()
    await checkRedis()

    if (cacheTtlMs > 0) {
      cachedHealthCheck = {
        expiresAt: now + cacheTtlMs,
        error: null
      }
    }
  } catch (error) {
    if (cacheTtlMs > 0) {
      cachedHealthCheck = {
        expiresAt: now + cacheTtlMs,
        error
      }
    }
    throw error
  }
}

const healthCheckHandler = async (req, res) => {
  if (!isHealthCheckRequestAllowed(req)) {
    return res.status(404).json({ message: 'Route not found' })
  }

  try {
    await runHealthChecks()
    return res.json({ status: 'ok' })
  } catch {
    return res.status(503).json({ status: 'unhealthy' })
  }
}

module.exports = {
  DEFAULT_HEALTHCHECK_CACHE_TTL_MS,
  HEALTHCHECK_KEY_HEADER,
  hasValidHealthCheckKey,
  isHealthCheckRequestAllowed,
  runHealthChecks,
  healthCheckHandler
}
