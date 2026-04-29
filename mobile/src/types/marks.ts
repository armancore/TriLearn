export type ExamType = 'INTERNAL' | 'MIDTERM' | 'FINAL' | 'PREBOARD' | 'PRACTICAL';

export interface MarkSubject {
  name: string;
  code: string;
  semester?: number;
}

export interface StudentMark {
  id: string;
  studentId: string;
  subjectId: string;
  instructorId: string;
  examType: ExamType;
  totalMarks: number;
  obtainedMarks: number;
  grade: string;
  gradePoint: number;
  remarks?: string | null;
  isPublished: boolean;
  publishedAt?: string | null;
  createdAt: string;
  percentage: number;
  subject?: MarkSubject | null;
}

export interface ResultSheetSubject {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  obtainedMarks: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  gradePoint: number;
  remarks: string;
}

export interface MarksResultSheet {
  subjects: ResultSheetSubject[];
  totals: {
    obtainedMarks: number;
    totalMarks: number;
  };
  overallPercentage: number;
  overallGrade: string;
  overallGpa: number;
}

export interface MarksResponse {
  total: number;
  page: number;
  limit: number;
  examType: ExamType | null;
  availableExamTypes: ExamType[];
  marks: StudentMark[];
  resultSheet: MarksResultSheet;
}

export interface MarksSummaryResponse {
  examType: ExamType | null;
  availableExamTypes: ExamType[];
  resultSheet: MarksResultSheet;
  ranking: {
    rank: number | null;
    cohortSize: number;
    percentile: number;
    scope?: {
      semester: number;
      department: string | null;
    };
  };
}
