import Constants from 'expo-constants';

const extras = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? extras?.apiBaseUrl ?? 'http://localhost:4000/api/v1';
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? extras?.socketUrl ?? 'http://localhost:4000';
