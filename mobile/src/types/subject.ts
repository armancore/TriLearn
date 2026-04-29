export interface Subject {
  id: string;
  name: string;
  code: string;
  department: string;
  semester: number | string;
  enrolledStudentsCount?: number;
  enrolledStudents?: unknown[];
  upcomingAssignmentCount?: number;
  upcomingAssignmentsCount?: number;
}

export interface SubjectsResponse {
  subjects: Subject[];
}
