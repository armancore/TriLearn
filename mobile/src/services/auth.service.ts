import type { LoginRequest, LoginResponse, RefreshTokenResponse } from '@/src/types/auth';

import { API_BASE_URL } from '@/src/constants/config';
import axios from 'axios';
import Constants from 'expo-constants';
import { APP_PLATFORM, CLIENT_TYPE } from '@/src/services/mobileClientSignature';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

const authClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: false,
  headers: {
    'X-Client-Type': CLIENT_TYPE,
    'X-Client-Version': APP_VERSION,
    'X-App-Version': APP_VERSION,
    'X-App-Platform': APP_PLATFORM,
  },
});

authClient.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  delete (config.headers as Record<string, string>).Cookie;
  delete (config.headers as Record<string, string>).cookie;
  (config.headers as Record<string, string>)['X-Client-Type'] = CLIENT_TYPE;
  (config.headers as Record<string, string>)['X-Client-Version'] = APP_VERSION;
  (config.headers as Record<string, string>)['X-App-Version'] = APP_VERSION;
  (config.headers as Record<string, string>)['X-App-Platform'] = APP_PLATFORM;

  return config;
});

export const login = async (payload: LoginRequest): Promise<LoginResponse> => {
  const response = await authClient.post<LoginResponse>('/auth/login', payload);
  return response.data;
};

let refreshInFlight: { token: string; promise: Promise<RefreshTokenResponse> } | null = null;

export const refreshAccessToken = (refreshToken: string): Promise<RefreshTokenResponse> => {
  if (refreshInFlight?.token === refreshToken) return refreshInFlight.promise;
  const promise = authClient.post<RefreshTokenResponse>('/auth/refresh/mobile', { refreshToken })
    .then(response => response.data)
    .finally(() => { if (refreshInFlight?.promise === promise) refreshInFlight = null; });
  refreshInFlight = { token: refreshToken, promise };
  return promise;
};

// Use captured credentials, without the API client's refresh interceptor.
export const logout = async (accessToken: string | null, refreshToken: string | null, pushToken: string | null): Promise<void> => {
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  if (pushToken && accessToken) {
    await authClient.delete('/notifications/device-token', { data: { token: pushToken }, headers }).catch(() => {});
  }
  await authClient.post('/auth/logout/mobile', { refreshToken }, { headers });
};
