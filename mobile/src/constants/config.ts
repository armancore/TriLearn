import Constants from 'expo-constants';

const extras = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? extras?.apiBaseUrl ?? 'http://localhost:5000/api/v1';
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? extras?.socketUrl ?? 'http://localhost:5000';
export const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_URL ?? extras?.webAppUrl ?? 'http://localhost:5173';
export const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, '');
