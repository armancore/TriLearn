import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { API_ORIGIN } from '../utils/api'

const useLiveNotifications = ({
  enabled,
  token,
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
    if (!enabled || !token) {
      return undefined
    }

    const socket = io(API_ORIGIN, {
      auth: { token },
      withCredentials: true
    })

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
      socket.disconnect()
    }
  }, [enabled, token])
}

export default useLiveNotifications
