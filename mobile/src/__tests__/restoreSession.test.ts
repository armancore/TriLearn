import { restoreSession } from '@/src/services/restoreSession';
import { refreshAccessToken, logout } from '@/src/services/auth.service';
import { useAuthStore } from '@/src/store/auth.store';
import type { RefreshTokenResponse } from '@/src/types/auth';

jest.mock('@/src/services/auth.service', () => ({ refreshAccessToken: jest.fn(), logout: jest.fn(async () => {}) }));
jest.mock('@/src/store/auth.store', () => ({ useAuthStore: { getState: jest.fn() } }));
const setTokens = jest.fn();
const clearSession = jest.fn();
const state = { user: { id: 'test' }, refreshToken: 'saved', accessToken: null, sessionVersion: 0, setTokens, clearSession };
beforeEach(() => { jest.clearAllMocks(); state.sessionVersion = 0; jest.mocked(useAuthStore.getState).mockReturnValue(state as unknown as ReturnType<typeof useAuthStore.getState>); });
it('restores a saved session and shares concurrent startup requests', async () => {
  let resolve!: (value: RefreshTokenResponse) => void;
  jest.mocked(refreshAccessToken).mockReturnValue(new Promise(done => { resolve = done; }));
  const first = restoreSession(); const second = restoreSession();
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  resolve({ accessToken: 'new-access', refreshToken: 'rotated' });
  await Promise.all([first, second]);
  expect(setTokens).toHaveBeenCalledWith({ accessToken: 'new-access', refreshToken: 'rotated' });
});
it('revokes a late refresh after logout without restoring it', async () => {
  let resolve!: (value: RefreshTokenResponse) => void;
  jest.mocked(refreshAccessToken).mockReturnValue(new Promise(done => { resolve = done; }));
  const pending = restoreSession();
  jest.mocked(useAuthStore.getState).mockReturnValue({ ...state, sessionVersion: 1 } as unknown as ReturnType<typeof useAuthStore.getState>);
  resolve({ accessToken: 'new-access', refreshToken: 'rotated' }); await pending;
  expect(setTokens).not.toHaveBeenCalled(); expect(logout).toHaveBeenCalledWith('new-access', 'rotated', null);
});
it('clears a rejected saved session', async () => {
  jest.mocked(refreshAccessToken).mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
  await restoreSession(); expect(clearSession).toHaveBeenCalledTimes(1);
});
it('keeps saved credentials after temporary network failure', async () => {
  jest.mocked(refreshAccessToken).mockRejectedValue(new Error('offline'));
  await restoreSession(); expect(clearSession).not.toHaveBeenCalled(); expect(setTokens).not.toHaveBeenCalled();
});

it('accepts the shared rotation already applied by a screen request', async () => {
  let resolve!: (value: RefreshTokenResponse) => void;
  jest.mocked(refreshAccessToken).mockReturnValue(new Promise(done => { resolve = done; }));
  const pending = restoreSession();
  jest.mocked(useAuthStore.getState).mockReturnValue({ ...state, refreshToken: 'rotated' } as unknown as ReturnType<typeof useAuthStore.getState>);
  resolve({ accessToken: 'new-access', refreshToken: 'rotated' }); await pending;
  expect(logout).not.toHaveBeenCalled();
  expect(setTokens).toHaveBeenCalledWith({ accessToken: 'new-access', refreshToken: 'rotated' });
});
