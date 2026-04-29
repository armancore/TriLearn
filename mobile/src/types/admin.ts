import type { UserRole } from '@/src/types/auth';
import type { NoticeAudience, NoticeType } from '@/src/types/notice';

export interface AdminStats {
  totalUsers: number;
  totalStudents: number;
  totalInstructors: number;
  totalCoordinators: number;
  totalGatekeepers: number;
  totalSubjects: number;
}

export interface DepartmentsResponse {
  total: number;
  departments: Array<{ id: string; name: string }>;
}

export interface AdminStatsResponse {
  stats: AdminStats;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
  createdAt: string;
  student?: {
    id: string;
    rollNumber: string;
    semester: number;
    section?: string | null;
    department?: string | null;
  } | null;
  coordinator?: {
    department?: string | null;
  } | null;
  instructor?: {
    department?: string | null;
    departments?: string[];
  } | null;
}

export interface AdminUsersResponse {
  total: number;
  page: number;
  limit: number;
  users: AdminUser[];
}

export type ApplicationStatus = 'PENDING' | 'REVIEWED' | 'CONVERTED';

export interface StudentApplication {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  preferredDepartment: string;
  preferredSemester: number;
  preferredSection?: string | null;
  status: ApplicationStatus;
  createdAt: string;
}

export interface StudentApplicationsResponse {
  total: number;
  page: number;
  limit: number;
  applications: StudentApplication[];
}

export interface CoordinatorDepartmentReport {
  department: string;
  month: string;
  monthLabel: string;
  semester: number;
  section: string;
  totalStudents: number;
  summary: {
    present: number;
    absent: number;
    late: number;
    total: number;
    percentage?: number;
  };
  records: Array<{
    id: string;
    date: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE';
    subject: {
      name: string;
      code: string;
    };
    student: {
      id: string;
      name: string;
      email: string;
      rollNumber: string;
      section?: string | null;
    };
  }>;
  students: Array<{
    id: string;
    name: string;
    email: string;
    rollNumber: string;
    semester: number;
    section?: string | null;
    present: number;
    absent: number;
    late: number;
    totalRecords: number;
    monthlyAverage: string;
  }>;
}

export interface NoticeCreatePayload {
  title: string;
  content: string;
  type: NoticeType;
  audience: NoticeAudience;
}
