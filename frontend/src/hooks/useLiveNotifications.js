import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { API_ORIGIN } from '../utils/api'

const useLiveNotifications = ({
  enabled,
  onNotification,
  onNotificationRead,
  onNotificationsReadAll
}) => {
  const notificationHandlerRef = useRef(onNotification)
  const notificationReadHandlerRef = useRef(onNotificationRead)
  const notificationsReadAllHandlerRef = useRef(onNotificationsReadAll)

  useEffect(() => {
    notificationHandlerRef.current = onNotification
  }, [onNotification])

  useEffect(() => {
    notificationReadHandlerRef.current = onNotificationRead
  }, [onNotificationRead])

  useEffect(() => {
    notificationsReadAllHandlerRef.current = onNotificationsReadAll
  }, [onNotificationsReadAll])

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    const socket = io(API_ORIGIN, {
      path: '/api/v1/socket.io',
      withCredentials: true,
      autoConnect: false,
      reconnectionAttempts: 3,
      timeout: 5000,
      transports: ['polling', 'websocket']
    })
    let disposed = false
    const connectTimer = window.setTimeout(() => {
      if (!disposed) {
        socket.connect()
      }
    }, 0)

    socket.on('notification:new', (payload) => {
      notificationHandlerRef.current?.(payload)
    })

    socket.on('notification:read', (payload) => {
      notificationReadHandlerRef.current?.(payload)
    })

    socket.on('notification:read-all', (payload) => {
      notificationsReadAllHandlerRef.current?.(payload)
    })

    return () => {
      disposed = true
      window.clearTimeout(connectTimer)
      socket.off('notification:new')
      socket.off('notification:read')
      socket.off('notification:read-all')
      if (socket.connected) {
        socket.disconnect()
      }
    }
  }, [enabled])
}

export default useLiveNotifications
