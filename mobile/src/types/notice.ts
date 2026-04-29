export type NoticeType = 'GENERAL' | 'EXAM' | 'HOLIDAY' | 'EVENT' | 'URGENT';
export type NoticeAudience = 'ALL' | 'STUDENTS' | 'INSTRUCTORS_ONLY';

export interface Notice {
  id: string;
  title: string;
  content: string;
  type: NoticeType;
  audience: NoticeAudience;
  targetDepartment?: string | null;
  targetSemester?: number | null;
  postedBy: string;
  createdAt: string;
  user?: {
    name: string;
    role: string;
  } | null;
}

export interface NoticesResponse {
  total: number;
  page: number;
  limit: number;
  notices: Notice[];
}
