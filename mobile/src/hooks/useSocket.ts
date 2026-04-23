import { useEffect } from 'react';

import { connectSocket, disconnectSocket } from '@/src/services/socket.service';
import { useNotificationsStore } from '@/src/store/notifications.store';
import type { NotificationItem } from '@/src/types/notification';
import { useAuth } from '@/src/hooks/useAuth';

export const useSocket = (): void => {
  const { isAuthenticated, accessToken, user } = useAuth();
  const addNotification = useNotificationsStore((state) => state.addNotification);

  useEffect(() => {
    if (!isAuthenticated || !accessToken || !user) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket(accessToken, user.id);

    const handleIncomingNotification = (payload: NotificationItem): void => {
      addNotification(payload);
    };

    socket.on('notification:new', handleIncomingNotification);

    return () => {
      socket.off('notification:new', handleIncomingNotification);
    };
  }, [accessToken, addNotification, isAuthenticated, user]);
};
