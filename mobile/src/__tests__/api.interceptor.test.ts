import type { InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'crypto';
import type { AuthUser } from '@/src/types/auth';
import { useAuthStore } from '@/src/store/auth.store';

const mockCreateHash = createHash;
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

jest.mock('expo-crypto', () => {
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digest: jest.fn(async (_algorithm, data) => {
      const digest = mockCreateHash('sha256').update(Buffer.from(data as Uint8Array)).digest();
      return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
    }),
  };
});

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
  return mockRequestUse.mock.calls[0][0] as (
    config: InternalAxiosRequestConfig,
  ) => Promise<InternalAxiosRequestConfig>;
};

describe('api request interceptor', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(60000);
    process.env.EXPO_PUBLIC_MOBILE_CLIENT_SECRET = 'test-mobile-secret';
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isHydrated: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.EXPO_PUBLIC_MOBILE_CLIENT_SECRET;
  });

  it('attaches the Authorization header when accessToken is present in the store', async () => {
    useAuthStore.getState().setSession({
      user: testUser,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const interceptor = getRequestInterceptor();
    const config = await interceptor({ headers: {} } as InternalAxiosRequestConfig);

    expect((config.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
  });

  it('omits the Authorization header when accessToken is null', async () => {
    const interceptor = getRequestInterceptor();
    const config = await interceptor({ headers: {} } as InternalAxiosRequestConfig);

    expect((config.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('attaches signed mobile client headers', async () => {
    const interceptor = getRequestInterceptor();
    const config = await interceptor({ headers: {} } as InternalAxiosRequestConfig);
    const headers = config.headers as Record<string, string>;
    const expectedSignatures: Record<string, string> = {
      android: 'e21f89aa4044359f63fdbbc51a0d0347d789462d67dfb43366d9ad87a969c5ac',
      ios: '70eda7e04dec8b891fafede067a418196bcce557d79809e789c46a4037e9ee3f',
    };

    expect(headers['X-Client-Type']).toBe('mobile');
    expect(headers['X-Client-Version']).toBe('1.0.0');
    expect(headers['X-App-Version']).toBe('1.0.0');
    expect(headers['X-App-Platform']).toBeTruthy();
    expect(headers['X-Client-Signature']).toBe(expectedSignatures[headers['X-App-Platform']]);
  });
});
