const { Server } = require('socket.io')
const { createAdapter } = require('@socket.io/redis-adapter')
const jwt = require('jsonwebtoken')
const prisma = require('./prisma')
const { isRedisConfigured, getReadyRedisClient } = require('./redis')

let io = null
let redisAdapterSubClient = null
let memoryAdapterWarningShown = false
const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
const SOCKET_EVENT_RATE_LIMIT_MAX = parsePositiveInteger(process.env.SOCKET_EVENT_RATE_LIMIT_MAX, 60)
const SOCKET_EVENT_RATE_LIMIT_WINDOW_MS = parsePositiveInteger(process.env.SOCKET_EVENT_RATE_LIMIT_WINDOW_MS, 10_000)

const getRoomName = (userId) => `user:${userId}`

const getSocketAccessSecret = () => {
  const accessSecret = process.env.JWT_ACCESS_SECRET
  if (!accessSecret) {
    throw new Error('JWT_ACCESS_SECRET must be configured')
  }

  return accessSecret
}

const isDevelopmentEnvironment = () => process.env.NODE_ENV === 'development'
const isSocketNoOriginAllowed = () => (
  isDevelopmentEnvironment() &&
  String(process.env.ALLOW_SOCKET_NO_ORIGIN || '').trim().toLowerCase() === 'true'
)

const buildCorsOriginValidator = (allowedOrigins = []) => (origin, callback) => {
  if (!origin) {
    return isSocketNoOriginAllowed()
      ? callback(null, true)
      : callback(new Error('Not allowed by CORS'))
  }

  if (allowedOrigins.includes(origin)) {
    return callback(null, true)
  }

  return callback(new Error('Not allowed by CORS'))
}

const resolveSocketToken = (socket) => {
  const authToken = socket.handshake.auth?.token
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim()
  }

  const authorizationHeader = socket.handshake.headers?.authorization
  if (typeof authorizationHeader === 'string' && authorizationHeader.startsWith('Bearer ')) {
    return authorizationHeader.slice(7).trim()
  }

  return null
}

const verifySocketTokenUser = async (token) => {
  const decoded = jwt.verify(token, getSocketAccessSecret())
  if (decoded?.type !== 'access') {
    throw new Error('Invalid token type')
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: {
      id: true,
      role: true,
      isActive: true,
      deletedAt: true
    }
  })

  if (!user || user.deletedAt || !user.isActive) {
    throw new Error('User is not authorized')
  }

  return user
}

const createSocketEventRateLimiter = ({ maxEvents, windowMs, now = () => Date.now() }) => {
  let tokens = maxEvents
  let lastRefillAt = now()

  const refillTokens = () => {
    const currentTime = now()
    const elapsed = currentTime - lastRefillAt
    if (elapsed <= 0) {
      return
    }

    const refillAmount = (elapsed / windowMs) * maxEvents
    tokens = Math.min(maxEvents, tokens + refillAmount)
    lastRefillAt = currentTime
  }

  return {
    consume: (cost = 1) => {
      refillTokens()
      if (tokens < cost) {
        return false
      }

      tokens -= cost
      return true
    }
  }
}

const attachRedisAdapter = async (socketServer) => {
  if (!isRedisConfigured()) {
    if (!memoryAdapterWarningShown) {
      memoryAdapterWarningShown = true
      console.warn('Warning: REDIS_URL not set - Socket.io uses the per-process in-memory adapter that is not shared across cluster workers or instances')
    }

    return
  }

  const pubClient = await getReadyRedisClient({ context: 'Socket.io Redis adapter publisher' })
  if (!pubClient) {
    return
  }

  const subClient = pubClient.duplicate()
  subClient.on('error', (error) => {
    console.warn(`Warning: Socket.io Redis adapter subscriber error (${error.message})`)
  })

  try {
    await subClient.connect()
    socketServer.adapter(createAdapter(pubClient, subClient))
    redisAdapterSubClient = subClient
  } catch (error) {
    console.warn(`Warning: Socket.io Redis adapter unavailable, falling back to in-memory adapter (${error.message})`)
    try {
      await subClient.quit()
    } catch {
      subClient.destroy()
    }
  }
}

const initRealtime = async ({ server, allowedOrigins = [] }) => {
  if (io) {
    return io
  }

  io = new Server(server, {
    cors: {
      origin: buildCorsOriginValidator(allowedOrigins),
      credentials: true
    }
  })

  await attachRedisAdapter(io)

  io.use(async (socket, next) => {
    try {
      const token = resolveSocketToken(socket)
      if (!token) {
        return next(new Error('Authentication required'))
      }

      socket.data.user = await verifySocketTokenUser(token)
      next()
    } catch (error) {
      next(error)
    }
  })

  io.on('connection', (socket) => {
    const userId = socket.data.user?.id
    if (!userId) {
      socket.disconnect(true)
      return
    }

    const eventRateLimiter = createSocketEventRateLimiter({
      maxEvents: SOCKET_EVENT_RATE_LIMIT_MAX,
      windowMs: SOCKET_EVENT_RATE_LIMIT_WINDOW_MS
    })

    socket.use((packet, next) => {
      const eventName = Array.isArray(packet) ? packet[0] : null
      if (eventName === 'disconnect' || eventName === 'disconnecting') {
        return next()
      }

      if (eventRateLimiter.consume()) {
        return next()
      }

      return next(new Error('Too many socket events, please slow down.'))
    })

    socket.join(getRoomName(userId))

    socket.on('auth:refresh', async (payload, ack) => {
      try {
        const token = typeof payload?.token === 'string' ? payload.token.trim() : ''
        if (!token) {
          throw new Error('Authentication required')
        }

        const nextUser = await verifySocketTokenUser(token)
        if (nextUser.id !== socket.data.user?.id) {
          throw new Error('Cannot switch socket users')
        }

        socket.data.user = nextUser
        if (typeof ack === 'function') {
          ack({ ok: true })
        }
      } catch {
        if (typeof ack === 'function') {
          ack({ ok: false })
        }
        socket.disconnect(true)
      }
    })
  })

  return io
}

const emitToUser = (userId, eventName, payload) => {
  if (!io || !userId) {
    return
  }

  io.to(getRoomName(userId)).emit(eventName, payload)
}

const emitNotificationCreated = (userId, notification) => {
  emitToUser(userId, 'notification:new', { notification })
}

const emitNotificationRead = (userId, notificationId, readAt, unreadCount) => {
  emitToUser(userId, 'notification:read', { notificationId, readAt, unreadCount })
}

const emitNotificationsReadAll = (userId, readAt) => {
  emitToUser(userId, 'notification:read-all', { readAt, unreadCount: 0 })
}

const closeRealtime = async () => {
  if (!io) {
    return
  }

  await io.close()
  io = null
  if (redisAdapterSubClient) {
    try {
      await redisAdapterSubClient.quit()
    } catch {
      redisAdapterSubClient.destroy()
    } finally {
      redisAdapterSubClient = null
    }
  }
}

module.exports = {
  buildCorsOriginValidator,
  createSocketEventRateLimiter,
  initRealtime,
  closeRealtime,
  emitNotificationCreated,
  emitNotificationRead,
  emitNotificationsReadAll
}
