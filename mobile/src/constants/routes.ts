import type { UserRole } from '@/src/types/auth';

export const ROLE_HOME_MAP = {
  STUDENT: '/(student)/dashboard',
  INSTRUCTOR: '/(instructor)/dashboard',
  COORDINATOR: '/(coordinator)/dashboard',
  ADMIN: '/(admin)/dashboard',
  GATEKEEPER: '/(gatekeeper)/scanner',
} as const satisfies Record<UserRole, string>;

export const ROLE_GROUP_MAP = {
  STUDENT: '(student)',
  INSTRUCTOR: '(instructor)',
  COORDINATOR: '(coordinator)',
  ADMIN: '(admin)',
  GATEKEEPER: '(gatekeeper)',
} as const satisfies Record<UserRole, string>;
