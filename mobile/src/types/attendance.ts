export interface AttendanceSummary {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  present: number;
  absent: number;
  late: number;
  total: number;
  percentage: number;
}

export interface AttendanceSummaryResponse {
  subjects: AttendanceSummary[];
}
