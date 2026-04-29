import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/src/services/api';
import { useAuth } from '@/src/hooks/useAuth';
import { useNotificationsStore } from '@/src/store/notifications.store';
import type { NotificationsResponse } from '@/src/types/notification';

export const useNotifications = () => {
  const { isAuthenticated } = useAuth();
  const items = useNotificationsStore((state) => state.items);
  const markAsReadInStore = useNotificationsStore((state) => state.markAsRead);
  const reset = useNotificationsStore((state) => state.reset);
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const setNotifications = useNotificationsStore((state) => state.setNotifications);

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await api.get<NotificationsResponse>('/notifications');
      return response.data;
    },
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (query.data?.notifications) {
      setNotifications(query.data.notifications);
    }
  }, [query.data, setNotifications]);

  const markAsRead = async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    markAsReadInStore(id);
  };

  const markAllAsRead = async () => {
    await api.post('/notifications/read-all');
    reset();
    await query.refetch();
  };

  return {
    notifications: items,
    unreadCount,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    markAsRead,
    markAllAsRead,
  };
};
