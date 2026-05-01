import { useCallback, useEffect } from 'react';

import { disconnectSocket } from '@/src/services/socket.service';
import { api, resetRefreshState } from '@/src/services/api';
import { login as loginRequest } from '@/src/services/auth.service';
import { useAuthStore } from '@/src/store/auth.store';
import { useNotificationsStore } from '@/src/store/notifications.store';
import type { LoginRequest } from '@/src/types/auth';

export const useAuth = () => {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.logout);
  const resetNotifications = useNotificationsStore((state) => state.reset);

  useEffect(() => {
    if (__DEV__ && isHydrated && !accessToken && !refreshToken) {
      resetRefreshState();
    }
  }, [accessToken, isHydrated, refreshToken]);

  const login = useCallback(
    async (payload: LoginRequest) => {
      resetRefreshState();
      const response = await loginRequest(payload);
      setSession({
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      resetRefreshState();
      return response;
    },
    [setSession],
  );

  const logout = useCallback(() => {
    void api.post('/auth/logout').catch(() => {});
    clearSession();
    resetRefreshState();
    resetNotifications();
    disconnectSocket();
  }, [clearSession, resetNotifications]);

  return {
    user,
    accessToken,
    refreshToken,
    isHydrated,
    isAuthenticated: Boolean(accessToken && user),
    login,
    logout,
  };
};
