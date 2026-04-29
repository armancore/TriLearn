export type AbsenceTicketStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface TicketAttendance {
  id: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE';
  subject: {
    id?: string;
    name: string;
    code: string;
  };
}

export interface AbsenceTicket {
  id: string;
  attendanceId: string;
  reason: string;
  status: AbsenceTicketStatus;
  response?: string | null;
  reviewedAt?: string | null;
  attendance: TicketAttendance;
}

export interface MyAbsenceTicketsResponse {
  tickets: AbsenceTicket[];
  absencesWithoutTicket: TicketAttendance[];
}
