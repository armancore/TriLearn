import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/src/services/api';
import { useAuth } from '@/src/hooks/useAuth';
import { useNotificationsStore } from '@/src/store/notifications.store';
import type { NotificationItem } from '@/src/types/notification';

export const useNotifications = () => {
  const { isAuthenticated } = useAuth();
  const { items, unreadCount, setNotifications } = useNotificationsStore((state) => ({
    items: state.items,
    unreadCount: state.unreadCount,
    setNotifications: state.setNotifications,
  }));

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await api.get<NotificationItem[]>('/notifications');
      return response.data;
    },
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (query.data) {
      setNotifications(query.data);
    }
  }, [query.data, setNotifications]);

  return {
    ...query,
    notifications: items,
    unreadCount,
  };
};
