import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as SecureStore from 'expo-secure-store';

import type { AuthUser } from '@/src/types/auth';
import { useAuthStore } from '@/src/store/auth.store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('@/src/services/queryClient', () => ({
  queryClient: {
    removeQueries: jest.fn(),
  },
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
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      pushToken: null,
      isHydrated: false,
    });
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
});
