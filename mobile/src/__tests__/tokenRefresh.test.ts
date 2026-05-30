import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';

import type { AuthUser, RefreshTokenResponse } from '@/src/types/auth';
import { useAuthStore } from '@/src/store/auth.store';
import { refreshAccessToken } from '@/src/services/auth.service';

const mockRequestUse = jest.fn();
const mockResponseUse = jest.fn();
const mockApiClient = Object.assign(jest.fn(async (config: InternalAxiosRequestConfig) => ({ config, data: { ok: true } })), {
  interceptors: {
    request: { use: mockRequestUse },
    response: { use: mockResponseUse },
  },
});
const mockAxiosCreate = jest.fn(() => mockApiClient);
const mockUpdateSocketToken = jest.fn();

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
}));

jest.mock('@/src/services/socket.service', () => ({
  updateSocketToken: mockUpdateSocketToken,
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
