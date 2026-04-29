import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/src/services/api';
import { useAuth } from '@/src/hooks/useAuth';
import { useNotificationsStore } from '@/src/store/notifications.store';
import type { NotificationsResponse } from '@/src/types/notification';

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
      const response = await api.get<NotificationsResponse>('/notifications');
      return response.data.notifications;
    },
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (query.data) {
      setNotifications(query.data);
    }
  }, [query.data, setNotifications]);

  return {
    notifications: items,
    unreadCount,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
};
