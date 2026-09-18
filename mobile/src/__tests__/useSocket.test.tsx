import { act, renderHook } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useSocket } from '@/src/hooks/useSocket';
import { useNotificationsStore } from '@/src/store/notifications.store';

const mockState = { sessionVersion: 1, accessToken: 'access', user: { id: 'a' } };
const mockHandlers: Record<string, (...args: any[]) => void> = {};
const mockSocket = {
  auth: {}, connect: jest.fn(),
  on: jest.fn((event: string, fn: (...args: any[]) => void) => { mockHandlers[event] = fn; }),
  off: jest.fn(),
};
const mockGet = jest.fn<() => Promise<unknown>>();
jest.mock('@/src/hooks/useAuth', () => ({ useAuth: () => ({ isAuthenticated: true, accessToken: mockState.accessToken, user: mockState.user }) }));
jest.mock('@/src/store/auth.store', () => ({ useAuthStore: { getState: () => mockState } }));
jest.mock('@/src/services/api', () => ({ api: { get: () => mockGet() } }));
jest.mock('@/src/services/socket.service', () => ({ connectSocket: () => mockSocket, disconnectSocket: jest.fn() }));

describe('mobile socket session lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.sessionVersion = 1;
    mockState.accessToken = 'access';
    useNotificationsStore.getState().reset();
  });

  it('reconnects an expired socket with the refreshed credential', async () => {
    mockGet.mockImplementationOnce(async () => { mockState.accessToken = 'fresh'; });
    const { unmount } = renderHook(() => useSocket());
    await act(async () => { mockHandlers.disconnect('io server disconnect'); });
    expect(mockSocket.auth).toEqual({ token: 'fresh' });
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not reconnect or process notifications from an earlier account', async () => {
    let complete!: (value: unknown) => void;
    mockGet.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const { unmount } = renderHook(() => useSocket());
    act(() => { mockHandlers.disconnect('io server disconnect'); });
    mockState.sessionVersion = 2;
    await act(async () => {
      complete({});
      mockHandlers['notification:new']({ notification: { id: 'private-a' } });
    });
    expect(mockSocket.connect).not.toHaveBeenCalled();
    expect(useNotificationsStore.getState().items).toHaveLength(0);
    unmount();
  });
});
