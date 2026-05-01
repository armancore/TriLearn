import type { LoginRequest, LoginResponse, RefreshTokenResponse } from '@/src/types/auth';

import { API_BASE_URL } from '@/src/constants/config';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuthStore } from '@/src/store/auth.store';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

const authClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'X-Client-Type': 'mobile',
    'X-App-Version': APP_VERSION,
  },
});

authClient.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  (config.headers as Record<string, string>)['X-Client-Type'] = 'mobile';
  (config.headers as Record<string, string>)['X-App-Version'] = APP_VERSION;

  return config;
});

authClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 426) {
      useAuthStore.getState().clearSession();
    }

    return Promise.reject(error);
  },
);

export const login = async (payload: LoginRequest): Promise<LoginResponse> => {
  const response = await authClient.post<LoginResponse>('/auth/login', payload);
  return response.data;
};

export const refreshAccessToken = async (refreshToken: string): Promise<RefreshTokenResponse> => {
  const response = await authClient.post<RefreshTokenResponse>('/auth/refresh/mobile', { refreshToken });
  return response.data;
};
