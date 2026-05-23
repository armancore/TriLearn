import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/src/services/api';
import { useAuth } from '@/src/hooks/useAuth';
import { useAuthStore } from '@/src/store/auth.store';
import { useNotificationsStore } from '@/src/store/notifications.store';
import { isPushUnsupportedRuntime } from '@/src/services/pushNotifications';
import type { NotificationsResponse } from '@/src/types/notification';

const devicePlatform = Platform.select({
  android: 'ANDROID',
  ios: 'IOS',
} as const);

export const useNotifications = () => {
  const { isAuthenticated } = useAuth();
  const storedPushToken = useAuthStore((state) => state.pushToken);
  const setPushToken = useAuthStore((state) => state.setPushToken);
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

  useEffect(() => {
    if (!isAuthenticated || isPushUnsupportedRuntime || !devicePlatform) {
      return undefined;
    }

    let isMounted = true;

    const registerDeviceToken = async () => {
      const Notifications = await import('expo-notifications');
      const existingPermissions = await Notifications.getPermissionsAsync();
      const finalPermissions = existingPermissions.granted
        ? existingPermissions
        : await Notifications.requestPermissionsAsync();

      if (!finalPermissions.granted) {
        return;
      }

      const tokenResponse = await Notifications.getDevicePushTokenAsync();
      const token = String(tokenResponse.data || '');

      if (!token || token === storedPushToken) {
        return;
      }

      await api.post('/notifications/device-token', {
        token,
        platform: devicePlatform,
      });

      if (isMounted) {
        setPushToken(token);
      }
    };

    void registerDeviceToken().catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, setPushToken, storedPushToken]);

  const markAsRead = async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    markAsReadInStore(id);
  };

  const markAllAsRead = async () => {
    await api.patch('/notifications/read-all');
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
