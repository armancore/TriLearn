import { isAxiosError } from 'axios';
import { refreshAccessToken, logout as revokeSession } from '@/src/services/auth.service';
import { useAuthStore } from '@/src/store/auth.store';

let pending: Promise<void> | null = null;

/** Restore once after SecureStore hydration; stale replies cannot undo logout. */
export const restoreSession = (): Promise<void> => {
  if (pending) return pending;
  const session = useAuthStore.getState();
  if (!session.user || !session.refreshToken || session.accessToken) return Promise.resolve();
  const refreshToken = session.refreshToken;
  pending = (async () => {
    try {
      const tokens = await refreshAccessToken(refreshToken);
      const current = useAuthStore.getState();
      if (current.sessionVersion !== session.sessionVersion || (current.refreshToken !== refreshToken && current.refreshToken !== tokens.refreshToken)) {
        await revokeSession(tokens.accessToken, tokens.refreshToken ?? refreshToken, null).catch(() => {});
        return;
      }
      current.setTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken ?? refreshToken });
    } catch (error) {
      const current = useAuthStore.getState();
      if (current.sessionVersion === session.sessionVersion && current.refreshToken === refreshToken &&
          isAxiosError(error) && [401, 403, 426].includes(error.response?.status ?? 0)) {
        current.clearSession();
      }
      // Keep a saved session on temporary network failures so the next launch can retry.
    }
  })().finally(() => { pending = null; });
  return pending;
};
