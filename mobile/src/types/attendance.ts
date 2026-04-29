export interface AttendanceSummary {
  subjectId?: string;
  subject: string;
  code: string;
  present: number;
  absent: number;
  late: number;
  total: number;
  percentage: string;
}

export interface AttendanceSummaryResponse {
  total: number;
  page: number;
  limit: number;
  attendance: unknown[];
  summary: AttendanceSummary[];
}
