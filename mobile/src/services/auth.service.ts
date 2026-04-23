import type { LoginRequest, LoginResponse, RefreshTokenResponse } from '@/src/types/auth';

import { API_BASE_URL } from '@/src/constants/config';
import axios from 'axios';

const authClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export const login = async (payload: LoginRequest): Promise<LoginResponse> => {
  const response = await authClient.post<LoginResponse>('/auth/login', payload);
  return response.data;
};

export const refreshAccessToken = async (refreshToken: string): Promise<RefreshTokenResponse> => {
  const response = await authClient.post<RefreshTokenResponse>('/auth/refresh', { refreshToken });
  return response.data;
};
