export type SubmissionStatus = 'SUBMITTED' | 'GRADED' | 'LATE';
export type AssignmentFilter = 'ALL' | 'PENDING' | 'SUBMITTED' | 'GRADED';

export interface AssignmentSubject {
  name: string;
  code: string;
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  fileUrl?: string | null;
  note?: string | null;
  feedback?: string | null;
  submittedAt: string;
  status: SubmissionStatus;
  obtainedMarks?: number | null;
}

export interface Assignment {
  id: string;
  title: string;
  description?: string | null;
  questionPdfUrl?: string | null;
  dueDate: string;
  totalMarks: number;
  createdAt?: string;
  subject?: AssignmentSubject | null;
  submissions?: AssignmentSubmission[];
  submission?: AssignmentSubmission | null;
  _count?: {
    submissions: number;
  };
}

export interface AssignmentsResponse {
  total: number;
  page: number;
  limit: number;
  assignments: Assignment[];
}

export interface MySubmissionsResponse {
  total: number;
  submissions: AssignmentSubmission[];
}
