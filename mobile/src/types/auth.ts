export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'COORDINATOR' | 'ADMIN' | 'GATEKEEPER';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken?: string;
}
