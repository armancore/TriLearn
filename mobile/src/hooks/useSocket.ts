import { useEffect } from 'react';

import { connectSocket, disconnectSocket } from '@/src/services/socket.service';
import { useNotificationsStore } from '@/src/store/notifications.store';
import type { NotificationItem } from '@/src/types/notification';
import { useAuth } from '@/src/hooks/useAuth';

export const useSocket = (): void => {
  const { isAuthenticated, accessToken, user } = useAuth();
  const userId = user?.id;
  const addNotification = useNotificationsStore((state) => state.addNotification);
  const markAsRead = useNotificationsStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationsStore((state) => state.markAllAsRead);

  useEffect(() => {
    if (!isAuthenticated || !accessToken || !userId) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket(accessToken, userId);

    const handleIncomingNotification = (
      payload: { notification: NotificationItem }
    ): void => {
      if (payload?.notification) {
        addNotification(payload.notification);
      }
    };

    const handleNotificationRead = (
      payload: { id?: string; notificationId?: string; notification?: NotificationItem }
    ): void => {
      const notificationId = payload?.id ?? payload?.notificationId ?? payload?.notification?.id;

      if (notificationId) {
        markAsRead(notificationId);
      }
    };

    const handleNotificationsReadAll = (): void => {
      markAllAsRead();
    };

    socket.on('notification:new', handleIncomingNotification);
    socket.on('notification:read', handleNotificationRead);
    socket.on('notification:read-all', handleNotificationsReadAll);

    return () => {
      socket.off('notification:new', handleIncomingNotification);
      socket.off('notification:read', handleNotificationRead);
      socket.off('notification:read-all', handleNotificationsReadAll);
    };
  }, [accessToken, addNotification, isAuthenticated, markAllAsRead, markAsRead, userId]);
};
