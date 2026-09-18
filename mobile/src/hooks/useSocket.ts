import { useEffect } from 'react';

import { connectSocket, disconnectSocket } from '@/src/services/socket.service';
import { useNotificationsStore } from '@/src/store/notifications.store';
import type { NotificationItem } from '@/src/types/notification';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import { useAuthStore } from '@/src/store/auth.store';

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

    const socket = connectSocket(accessToken);
    let disposed = false;
    const version = useAuthStore.getState().sessionVersion;
    const handleDisconnect = (reason: string) => {
      if (reason !== 'io server disconnect' || disposed) return;
      void api.get('/auth/me').then(() => {
        const state = useAuthStore.getState();
        if (!disposed && state.sessionVersion === version && state.accessToken) {
          socket.auth = { token: state.accessToken };
          socket.connect();
        }
      }).catch(() => {});
    };

    const handleIncomingNotification = (
      payload: { notification: NotificationItem }
    ): void => {
      if (!disposed && useAuthStore.getState().sessionVersion === version && payload?.notification) {
        addNotification(payload.notification);
      }
    };

    const handleNotificationRead = (
      payload: { id?: string; notificationId?: string; notification?: NotificationItem }
    ): void => {
      const notificationId = payload?.id ?? payload?.notificationId ?? payload?.notification?.id;

      if (!disposed && useAuthStore.getState().sessionVersion === version && notificationId) {
        markAsRead(notificationId);
      }
    };

    const handleNotificationsReadAll = (): void => {
      if (disposed || useAuthStore.getState().sessionVersion !== version) return;
      markAllAsRead();
    };

    socket.on('notification:new', handleIncomingNotification);
    socket.on('notification:read', handleNotificationRead);
    socket.on('notification:read-all', handleNotificationsReadAll);
    socket.on('disconnect', handleDisconnect);

    return () => {
      disposed = true;
      socket.off('notification:new', handleIncomingNotification);
      socket.off('notification:read', handleNotificationRead);
      socket.off('notification:read-all', handleNotificationsReadAll);
      socket.off('disconnect', handleDisconnect);
    };
  }, [accessToken, addNotification, isAuthenticated, markAllAsRead, markAsRead, userId]);
};
