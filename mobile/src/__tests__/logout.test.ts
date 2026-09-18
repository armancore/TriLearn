import { beforeAll, describe, expect, it, jest } from '@jest/globals';

const mockPost = jest.fn(async (..._args: unknown[]) => ({ data: {} }));
const mockDelete = jest.fn(async (..._args: unknown[]) => ({ data: {} }));
const mockRequestUse = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { create: () => ({ post: mockPost, delete: mockDelete, interceptors: { request: { use: mockRequestUse } } }) },
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));

let logout: typeof import('@/src/services/auth.service').logout;
beforeAll(() => {
  logout = jest.requireActual<typeof import('@/src/services/auth.service')>('@/src/services/auth.service').logout;
});

describe('native logout transport', () => {
  it('uses captured access and refresh credentials and unregisters the device without refresh interception', async () => {
    await logout('captured-access', 'captured-refresh', 'push-token');
    expect(mockDelete).toHaveBeenCalledWith('/notifications/device-token', {
      data: { token: 'push-token' }, headers: { Authorization: 'Bearer captured-access' },
    });
    expect(mockPost).toHaveBeenCalledWith('/auth/logout/mobile', {
      refreshToken: 'captured-refresh',
    }, { headers: { Authorization: 'Bearer captured-access' } });
  });

  it('can revoke a restored refresh-only session', async () => {
    await logout(null, 'restored-refresh', null);
    expect(mockPost).toHaveBeenLastCalledWith('/auth/logout/mobile', { refreshToken: 'restored-refresh' }, { headers: {} });
  });
});
