import type { InternalAxiosRequestConfig } from 'axios';
import type { AuthUser } from '@/src/types/auth';
import { useAuthStore } from '@/src/store/auth.store';

const mockRequestUse = jest.fn();
const mockResponseUse = jest.fn();
const mockApiClient = Object.assign(jest.fn(), {
  interceptors: {
    request: { use: mockRequestUse },
    response: { use: mockResponseUse },
  },
});
const mockAxiosCreate = jest.fn(() => mockApiClient);

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
  updateSocketToken: jest.fn(),
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
};

require('@/src/services/api');

const getRequestInterceptor = () => {
  return mockRequestUse.mock.calls[0][0] as (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
};

describe('api request interceptor', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isHydrated: false,
    });
  });

  it('attaches the Authorization header when accessToken is present in the store', () => {
    useAuthStore.getState().setSession({
      user: testUser,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const interceptor = getRequestInterceptor();
    const config = interceptor({ headers: {} } as InternalAxiosRequestConfig);

    expect((config.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
  });

  it('omits the Authorization header when accessToken is null', () => {
    const interceptor = getRequestInterceptor();
    const config = interceptor({ headers: {} } as InternalAxiosRequestConfig);

    expect((config.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
