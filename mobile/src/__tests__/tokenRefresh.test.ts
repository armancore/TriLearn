import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';

import type { AuthUser, RefreshTokenResponse } from '@/src/types/auth';
import { useAuthStore } from '@/src/store/auth.store';
import { refreshAccessToken, logout as revokeSession } from '@/src/services/auth.service';
import { updateSocketToken } from '@/src/services/socket.service';

const mockRequestUse = jest.fn();
const mockResponseUse = jest.fn();
const mockApiClient = Object.assign(jest.fn(async (config: InternalAxiosRequestConfig) => ({ config, data: { ok: true } })), {
  interceptors: {
    request: { use: mockRequestUse },
    response: { use: mockResponseUse },
  },
});
const mockAxiosCreate = jest.fn(() => mockApiClient);
const mockUpdateSocketToken = updateSocketToken as jest.Mock;

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: mockAxiosCreate,
    isAxiosError: jest.fn(),
  },
  AxiosError: class AxiosError extends Error {},
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0' },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('@/src/services/auth.service', () => ({
  refreshAccessToken: jest.fn(),
  logout: jest.fn(async () => {}),
}));

jest.mock('@/src/services/socket.service', () => ({
  disconnectSocket: jest.fn(),
  updateSocketToken: jest.fn(),
}));

jest.mock('@/src/services/queryClient', () => ({
  queryClient: {
    cancelQueries: jest.fn(), clear: jest.fn(),
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

beforeAll(() => {
  jest.requireActual('@/src/services/api');
});

const getRejectedResponseInterceptor = () => {
  return mockResponseUse.mock.calls[0][1] as (error: AxiosError) => Promise<unknown>;
};
const refreshAccessTokenMock = refreshAccessToken as unknown as Mock<
  (refreshToken: string) => Promise<RefreshTokenResponse>
>;

const createUnauthorizedError = (config: InternalAxiosRequestConfig): AxiosError => ({
  name: 'AxiosError',
  message: 'Unauthorized',
  isAxiosError: true,
  toJSON: () => ({}),
  config,
  response: {
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config,
    data: { message: 'Unauthorized' },
  },
});

describe('api token refresh interceptor', () => {
  beforeEach(() => {
    mockApiClient.mockClear();
    mockUpdateSocketToken.mockClear();
    refreshAccessTokenMock.mockReset();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isHydrated: false,
    });
  });

  it.each(['resolve', 'reject'] as const)('an old refresh cannot restore or clear a new account when it %s', async (outcome) => {
    useAuthStore.getState().setSession({ user: testUser, accessToken: 'old', refreshToken: 'old-r' });
    let resolve!: (value: RefreshTokenResponse) => void;
    let reject!: (error: Error) => void;
    refreshAccessTokenMock.mockImplementationOnce(() => new Promise((res, rej) => { resolve = res; reject = rej; }));
    const pending = getRejectedResponseInterceptor()(createUnauthorizedError({ headers: {}, url: '/marks' } as InternalAxiosRequestConfig));
    useAuthStore.getState().logout();
    useAuthStore.getState().setSession({ user: { ...testUser, id: 'user-b' }, accessToken: 'new', refreshToken: 'new-r' });
    if (outcome === 'resolve') resolve({ accessToken: 'old-restored', refreshToken: 'old-restored-r' });
    else reject(new Error('old refresh failed'));
    await expect(pending).rejects.toBeInstanceOf(Error);
    expect(useAuthStore.getState().accessToken).toBe('new');
    expect(useAuthStore.getState().user?.id).toBe('user-b');
    expect(mockApiClient).not.toHaveBeenCalled();
    if (outcome === 'resolve') expect(revokeSession).toHaveBeenCalledWith('old-restored', 'old-restored-r', null);
  });

  it('refreshes after a 401 response and retries the original request', async () => {
    useAuthStore.getState().setSession({
      user: testUser,
      accessToken: 'expired-access-token',
      refreshToken: 'refresh-token',
    });
    const refreshed: RefreshTokenResponse = {
      accessToken: 'fresh-access-token',
      refreshToken: 'fresh-refresh-token',
    };
    refreshAccessTokenMock.mockResolvedValueOnce(refreshed);
    const originalRequest = {
      headers: {},
      method: 'get',
      url: '/protected',
    } as InternalAxiosRequestConfig;

    await getRejectedResponseInterceptor()(createUnauthorizedError(originalRequest));

    expect(refreshAccessToken).toHaveBeenCalledWith('refresh-token');
    expect(useAuthStore.getState().accessToken).toBe('fresh-access-token');
    expect(useAuthStore.getState().refreshToken).toBe('fresh-refresh-token');
    expect(mockUpdateSocketToken).toHaveBeenCalledWith('fresh-access-token');
    expect(mockApiClient).toHaveBeenCalledWith(expect.objectContaining({
      _retry: true,
      headers: expect.objectContaining({
        Authorization: 'Bearer fresh-access-token',
      }),
      url: '/protected',
    }));
  });

  it('clears the session and does not retry when refresh fails', async () => {
    useAuthStore.getState().setSession({
      user: testUser,
      accessToken: 'expired-access-token',
      refreshToken: 'refresh-token',
    });
    const refreshError = new Error('refresh failed');
    refreshAccessTokenMock.mockRejectedValueOnce(refreshError);
    const originalRequest = {
      headers: {},
      method: 'get',
      url: '/protected',
    } as InternalAxiosRequestConfig;

    await expect(getRejectedResponseInterceptor()(createUnauthorizedError(originalRequest))).rejects.toBe(refreshError);

    expect(refreshAccessToken).toHaveBeenCalledWith('refresh-token');
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(mockApiClient).not.toHaveBeenCalled();
  });
});
