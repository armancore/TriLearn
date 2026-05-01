import type { UserRole } from '@/src/types/auth';

export interface ProfileUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
  profileCompleted?: boolean;
  emailVerified?: boolean;
  phone?: string | null;
  address?: string | null;
  avatar?: string | null;
  isActive?: boolean;
  createdAt?: string;
  student?: {
    id: string;
    rollNumber: string;
    semester: number;
    section?: string | null;
    department?: string | null;
  } | null;
  instructor?: {
    id?: string;
    department?: string | null;
    departments?: string[];
  } | null;
  coordinator?: {
    department?: string | null;
  } | null;
}

export interface ProfileResponse {
  user: ProfileUser;
}

export interface ProfileUpdatePayload {
  name?: string;
  phone?: string;
  address?: string;
}

export interface AuthActivityItem {
  id: string;
  action: string;
  entityType?: string | null;
  metadata?: unknown;
  createdAt: string;
}

export interface AuthSession {
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AuthActivityResponse {
  activity: AuthActivityItem[];
  sessions: AuthSession[];
}
