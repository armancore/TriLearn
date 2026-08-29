import Constants from 'expo-constants';

const extras = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;

/**
 * `??` alone would accept an empty string from a commented-out or blank .env
 * entry and leave the app pointing at nothing, so blanks fall through too.
 */
const pick = (...values: (string | undefined)[]) =>
  values.find((value) => typeof value === 'string' && value.trim().length > 0)!;

export const API_BASE_URL = pick(
  process.env.EXPO_PUBLIC_API_URL,
  extras?.apiBaseUrl,
  'http://localhost:5000/api/v1',
);
export const SOCKET_URL = pick(process.env.EXPO_PUBLIC_SOCKET_URL, extras?.socketUrl, 'http://localhost:5000');
export const WEB_APP_URL = pick(process.env.EXPO_PUBLIC_WEB_URL, extras?.webAppUrl, 'http://localhost:5173');
export const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, '');
