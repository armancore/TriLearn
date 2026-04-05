const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const prisma = require('./prisma')

let io = null

const getRoomName = (userId) => `user:${userId}`

const getSocketAccessSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured')
  }

  return process.env.JWT_SECRET
}

const buildCorsOriginValidator = (allowedOrigins = []) => (origin, callback) => {
  if (!origin) {
    return callback(null, true)
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

const initRealtime = ({ server, allowedOrigins = [] }) => {
  if (io) {
    return io
  }

  io = new Server(server, {
    cors: {
      origin: buildCorsOriginValidator(allowedOrigins),
      credentials: true
    }
  })

  io.use(async (socket, next) => {
    try {
      const token = resolveSocketToken(socket)
      if (!token) {
        return next(new Error('Authentication required'))
      }

      const decoded = jwt.verify(token, getSocketAccessSecret())
      if (decoded?.type !== 'access') {
        return next(new Error('Invalid token type'))
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
        return next(new Error('User is not authorized'))
      }

      socket.data.user = user
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

    socket.join(getRoomName(userId))
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
}

module.exports = {
  initRealtime,
  closeRealtime,
  emitNotificationCreated,
  emitNotificationRead,
  emitNotificationsReadAll
}
