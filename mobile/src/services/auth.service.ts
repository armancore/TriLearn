import type { LoginRequest, LoginResponse, RefreshTokenResponse } from '@/src/types/auth';

import { API_BASE_URL } from '@/src/constants/config';
import axios from 'axios';
import Constants from 'expo-constants';
import { APP_PLATFORM, buildMobileClientSignature, CLIENT_TYPE } from '@/src/services/mobileClientSignature';
import { useAuthStore } from '@/src/store/auth.store';

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

authClient.interceptors.request.use(async (config) => {
  const clientSignature = await buildMobileClientSignature(APP_VERSION);

  config.headers = config.headers ?? {};
  delete (config.headers as Record<string, string>).Cookie;
  delete (config.headers as Record<string, string>).cookie;
  (config.headers as Record<string, string>)['X-Client-Type'] = CLIENT_TYPE;
  (config.headers as Record<string, string>)['X-Client-Version'] = APP_VERSION;
  (config.headers as Record<string, string>)['X-App-Version'] = APP_VERSION;
  (config.headers as Record<string, string>)['X-App-Platform'] = APP_PLATFORM;

  if (clientSignature) {
    (config.headers as Record<string, string>)['X-Client-Signature'] = clientSignature;
  }

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
