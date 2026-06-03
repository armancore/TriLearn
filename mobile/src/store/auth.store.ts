import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { queryClient } from '@/src/services/queryClient';
import type { AuthUser } from '@/src/types/auth';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  pushToken: string | null;
  isHydrated: boolean;
  setSession: (payload: { user: AuthUser; accessToken: string; refreshToken: string }) => void;
  setTokens: (payload: { accessToken: string; refreshToken: string }) => void;
  setPushToken: (token: string | null) => void;
  updateUser: (user: AuthUser) => void;
  logout: () => void;
  clearSession: () => void;
  setHydrated: (value: boolean) => void;
}

const getWebStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage ?? null;
};

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

const webLocalStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return getWebStorage()?.getItem(name) ?? null;
    } catch (error) {
      console.warn('Failed to read auth session from localStorage', error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      getWebStorage()?.setItem(name, value);
    } catch (error) {
      console.warn('Failed to persist auth session to localStorage', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      getWebStorage()?.removeItem(name);
    } catch (error) {
      console.warn('Failed to remove auth session from localStorage', error);
    }
  },
};

const authStorage = Platform.OS === 'web' ? webLocalStorage : nativeSecureStorage;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      pushToken: null,
      isHydrated: false,
      setSession: ({ user, accessToken, refreshToken }) => {
        set({ user, accessToken, refreshToken });
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
        queryClient.removeQueries({ queryKey: ['student-id-qr'] });
        set({ user: null, accessToken: null, refreshToken: null, pushToken: null });
      },
      clearSession: () => {
        queryClient.removeQueries({ queryKey: ['student-id-qr'] });
        set({ user: null, accessToken: null, refreshToken: null, pushToken: null });
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
        accessToken: state.accessToken,
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
