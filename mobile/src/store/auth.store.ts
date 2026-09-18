import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { queryClient } from '@/src/services/queryClient';
import { disconnectSocket } from '@/src/services/socket.service';
import { useNotificationsStore } from '@/src/store/notifications.store';
import type { AuthUser } from '@/src/types/auth';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  pushToken: string | null;
  isHydrated: boolean;
  sessionVersion: number;
  setSession: (payload: { user: AuthUser; accessToken: string; refreshToken: string }) => void;
  setTokens: (payload: { accessToken: string; refreshToken: string }) => void;
  setPushToken: (token: string | null) => void;
  updateUser: (user: AuthUser) => void;
  logout: () => void;
  clearSession: () => void;
  setHydrated: (value: boolean) => void;
}

const nativeSecureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch (error) {
      console.warn('Failed to read auth session from SecureStore', error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (error) {
      console.warn('Failed to persist auth session to SecureStore', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (error) {
      console.warn('Failed to remove auth session from SecureStore', error);
    }
  },
};

const webMemoryStorage = (() => {
  const values = new Map<string, string>();

  return {
    getItem: async (name: string): Promise<string | null> => {
      return values.get(name) ?? null;
    },
    setItem: async (name: string, value: string): Promise<void> => {
      values.set(name, value);
    },
    removeItem: async (name: string): Promise<void> => {
      values.delete(name);
    },
  };
})();

const authStorage = Platform.OS === 'web' ? webMemoryStorage : nativeSecureStorage;

const clearPrivateState = () => {
  disconnectSocket();
  useNotificationsStore.getState().reset();
  void queryClient.cancelQueries();
  queryClient.clear();
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      pushToken: null,
      isHydrated: false,
      sessionVersion: 0,
      setSession: ({ user, accessToken, refreshToken }) => {
        clearPrivateState();
        set({ user, accessToken, refreshToken, pushToken: null, sessionVersion: get().sessionVersion + 1 });
      },
      setTokens: ({ accessToken, refreshToken }) => {
        set({ accessToken, refreshToken });
      },
      setPushToken: (token) => {
        set({ pushToken: token });
      },
      updateUser: (user) => {
        set({ user });
      },
      logout: () => {
        clearPrivateState();
        set({ user: null, accessToken: null, refreshToken: null, pushToken: null, sessionVersion: get().sessionVersion + 1 });
      },
      clearSession: () => {
        clearPrivateState();
        set({ user: null, accessToken: null, refreshToken: null, pushToken: null, sessionVersion: get().sessionVersion + 1 });
      },
      setHydrated: (value) => {
        set({ isHydrated: value });
      },
    }),
    {
      name: 'trilearn-auth-store',
      storage: createJSONStorage(() => authStorage),
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
        pushToken: state.pushToken,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('Failed to hydrate auth session', error);
        }
        state?.setHydrated(true);
      },
    },
  ),
);
