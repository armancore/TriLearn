import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as SecureStore from 'expo-secure-store';

import type { AuthUser } from '@/src/types/auth';
import { useAuthStore } from '@/src/store/auth.store';
import { queryClient } from '@/src/services/queryClient';
import { useNotificationsStore } from '@/src/store/notifications.store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));


const testUser: AuthUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'STUDENT',
  mustChangePassword: false,
  profileCompleted: true,
  emailVerified: true,
};

describe('auth store persistence', () => {
  afterEach(() => queryClient.clear());
  beforeEach(() => {
    queryClient.setDefaultOptions({ queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } });
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      pushToken: null,
      isHydrated: false,
    });
  });

  it.each(['logout', 'clearSession'] as const)('%s removes all private query and mutation data before another login', (action) => {
    useAuthStore.getState().setSession({ user: testUser, accessToken: 'a', refreshToken: 'r' });
    for (const key of [['marks', 'my'], ['auth', 'me'], ['auth', 'activity'], ['student-id-qr']]) {
      queryClient.setQueryData(key, { private: 'account-a' });
    }
    queryClient.getMutationCache().build(queryClient, { mutationKey: ['private'], gcTime: Infinity });
    useNotificationsStore.setState({ items: [{ id: 'a', title: 'Private A message', message: 'Private', type: 'INFO', createdAt: '2026-01-01', isRead: false }], unreadCount: 1 });
    useAuthStore.getState()[action]();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(useNotificationsStore.getState().items).toHaveLength(0);
    expect(useNotificationsStore.getState().unreadCount).toBe(0);
    useAuthStore.getState().setSession({ user: { ...testUser, id: 'user-b' }, accessToken: 'b', refreshToken: 'rb' });
    expect(queryClient.getQueryData(['marks', 'my'])).toBeUndefined();
    queryClient.setQueryData(['marks', 'my'], { private: 'account-b' });
    expect(queryClient.getQueryData(['marks', 'my'])).toEqual({ private: 'account-b' });
  });

  it('direct identity switch cancels pending queries so late account A data cannot populate account B', async () => {
    useAuthStore.getState().setSession({ user: testUser, accessToken: 'a', refreshToken: 'r' });
    let finish!: (value: string) => void;
    const pending = queryClient.fetchQuery({ queryKey: ['marks', 'my'], queryFn: () => new Promise<string>(resolve => { finish = resolve; }) }).catch(() => undefined);
    useNotificationsStore.setState({ items: [{ id: 'a', title: 'Private A message', message: 'Private', type: 'INFO', createdAt: '2026-01-01', isRead: false }], unreadCount: 1 });
    useAuthStore.getState().setSession({ user: { ...testUser, id: 'user-b' }, accessToken: 'b', refreshToken: 'rb' });
    finish('private account A marks');
    await pending;
    expect(queryClient.getQueryData(['marks', 'my'])).toBeUndefined();
    expect(useNotificationsStore.getState().items).toHaveLength(0);
  });

  it('persists refresh tokens through expo-secure-store', async () => {
    useAuthStore.getState().setSession({
      user: testUser,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'trilearn-auth-store',
      expect.stringContaining('"refreshToken":"refresh-token"'),
    );
  });

  it('keeps access tokens out of the SecureStore persistence payload', async () => {
    useAuthStore.getState().setSession({
      user: testUser,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    await Promise.resolve();
    await Promise.resolve();

    const persistedPayload = (SecureStore.setItemAsync as jest.Mock).mock.calls
      .filter(([key]) => key === 'trilearn-auth-store')
      .at(-1)?.[1] as string;

    expect(persistedPayload).toContain('"refreshToken":"refresh-token"');
    expect(persistedPayload).not.toContain('access-token');
    expect(persistedPayload).not.toContain('"accessToken"');
  });
});
