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

const resetStore = () => {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    isHydrated: false,
  });
};

describe('auth store', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setSession correctly stores user, accessToken, and refreshToken', () => {
    useAuthStore.getState().setSession({
      user: testUser,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(useAuthStore.getState().user).toEqual(testUser);
    expect(useAuthStore.getState().accessToken).toBe('access-token');
    expect(useAuthStore.getState().refreshToken).toBe('refresh-token');
  });

  it('logout clears user, accessToken, and refreshToken', () => {
    useAuthStore.getState().setSession({
      user: testUser,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it('clearSession clears user, accessToken, and refreshToken', () => {
    useAuthStore.getState().setSession({
      user: testUser,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    useAuthStore.getState().clearSession();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});
