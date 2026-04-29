import type { ExamType } from '@/src/types/marks';
import type { Subject } from '@/src/types/subject';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE';

export interface EnrolledStudent {
  id: string;
  userId: string;
  name: string;
  email: string;
  rollNumber: string;
  semester: number;
  section?: string | null;
  department?: string | null;
}

export interface SubjectStudentsResponse {
  total: number;
  students: EnrolledStudent[];
  subject: Subject;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  subjectId: string;
  status: AttendanceStatus;
  date: string;
  student?: {
    rollNumber: string;
    user?: {
      name: string;
      email: string;
    };
  };
}

export interface AttendanceBySubjectResponse {
  total: number;
  page: number;
  limit: number;
  attendance: AttendanceRecord[];
  summary: {
    present: number;
    absent: number;
    late: number;
    total: number;
  };
  subject: Subject;
}

export interface ManualAttendancePayload {
  subjectId: string;
  attendanceDate: string;
  semester?: number;
  section?: string | null;
  attendanceList: Array<{
    studentId: string;
    status: AttendanceStatus;
  }>;
}

export interface GenerateQrResponse {
  message: string;
  qrCode: string;
  expiresIn: string;
  subjectId: string;
  instructorId: string;
}

export interface InstructorMark {
  id: string;
  studentId: string;
  subjectId: string;
  examType: ExamType;
  totalMarks: number;
  obtainedMarks: number;
  grade: string;
  gradePoint: number;
  remarks?: string | null;
  isPublished: boolean;
}

export interface SubjectMarksResponse {
  total: number;
  page: number;
  limit: number;
  marks: InstructorMark[];
  subject: Subject;
}

export interface BulkMarksPayload {
  subjectId: string;
  examType: ExamType;
  totalMarks: number;
  entries: Array<{
    studentId: string;
    obtainedMarks: number;
    remarks?: string;
  }>;
}
