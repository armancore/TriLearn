-- Drop redundant index now covered by the unique constraint
DROP INDEX IF EXISTS "Attendance_studentId_subjectId_date_idx";

-- CreateTable
CREATE TABLE "AbsenceTicket" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "response" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbsenceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbsenceTicket_attendanceId_key" ON "AbsenceTicket"("attendanceId");

-- CreateIndex
CREATE INDEX "AbsenceTicket_studentId_status_idx" ON "AbsenceTicket"("studentId", "status");

-- CreateIndex
CREATE INDEX "AbsenceTicket_status_createdAt_idx" ON "AbsenceTicket"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AbsenceTicket" ADD CONSTRAINT "AbsenceTicket_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceTicket" ADD CONSTRAINT "AbsenceTicket_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
