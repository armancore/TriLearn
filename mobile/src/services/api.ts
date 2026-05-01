import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';

import { API_BASE_URL } from '@/src/constants/config';
import { refreshAccessToken } from '@/src/services/auth.service';
import { updateSocketToken } from '@/src/services/socket.service';
import { useAuthStore } from '@/src/store/auth.store';
import type { RefreshTokenResponse } from '@/src/types/auth';

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

let refreshPromise: Promise<RefreshTokenResponse> | null = null;
let isSessionInvalidated = false;
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export const resetRefreshState = (): void => {
  refreshPromise = null;
  isSessionInvalidated = false;
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'X-Client-Type': 'mobile',
    'X-App-Version': APP_VERSION,
  },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;

  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  config.headers = config.headers ?? {};
  (config.headers as Record<string, string>)['X-Client-Type'] = 'mobile';
  (config.headers as Record<string, string>)['X-App-Version'] = APP_VERSION;

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const authState = useAuthStore.getState();

    if (error.response?.status === 426) {
      isSessionInvalidated = true;
      authState.clearSession();
      refreshPromise = null;
      return Promise.reject(error);
    }

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isSessionInvalidated) {
      return Promise.reject(error);
    }

    if (!authState.refreshToken) {
      isSessionInvalidated = true;
      authState.clearSession();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken(authState.refreshToken);
      }

      const refreshed = await refreshPromise;
      const nextRefreshToken = refreshed.refreshToken ?? authState.refreshToken;

      authState.setTokens({
        accessToken: refreshed.accessToken,
        refreshToken: nextRefreshToken,
      });
      updateSocketToken(refreshed.accessToken);
      refreshPromise = null;

      originalRequest.headers = originalRequest.headers ?? {};
      (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${refreshed.accessToken}`;
      (originalRequest.headers as Record<string, string>)['X-Client-Type'] = 'mobile';
      (originalRequest.headers as Record<string, string>)['X-App-Version'] = APP_VERSION;

      return api(originalRequest);
    } catch (refreshError) {
      isSessionInvalidated = true;
      authState.clearSession();
      refreshPromise = null;
      return Promise.reject(refreshError);
    }
  },
);
