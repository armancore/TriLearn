import { useCallback } from 'react';

import { disconnectSocket } from '@/src/services/socket.service';
import { login as loginRequest } from '@/src/services/auth.service';
import { useAuthStore } from '@/src/store/auth.store';
import { useNotificationsStore } from '@/src/store/notifications.store';
import type { LoginRequest } from '@/src/types/auth';

export const useAuth = () => {
  const { user, accessToken, refreshToken, isHydrated, setSession, clearSession } = useAuthStore((state) => ({
    user: state.user,
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    isHydrated: state.isHydrated,
    setSession: state.setSession,
    clearSession: state.clearSession,
  }));
  const resetNotifications = useNotificationsStore((state) => state.reset);

  const login = useCallback(
    async (payload: LoginRequest) => {
      const response = await loginRequest(payload);
      setSession({
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      return response;
    },
    [setSession],
  );

  const logout = useCallback(() => {
    clearSession();
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
