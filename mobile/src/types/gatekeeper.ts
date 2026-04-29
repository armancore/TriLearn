export interface GateWindow {
  id: string;
  title: string;
  dayOfWeek: 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';
  startTime: string;
  endTime: string;
  allowedSemesters: number[];
  isActive: boolean;
}

export interface ScanResult {
  studentId: string;
  rollNumber: string;
  name: string;
  department: string;
  semester: number;
  message: string;
}
