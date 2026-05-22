-- CreateEnum
CREATE TYPE "DisciplinaryType" AS ENUM ('WARNING', 'MISCONDUCT', 'CHEATING', 'ABSENCE_VIOLATION', 'PROPERTY_DAMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('MINOR', 'MODERATE', 'SEVERE');

-- CreateTable
CREATE TABLE "DisciplinaryRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "type" "DisciplinaryType" NOT NULL,
    "description" TEXT NOT NULL,
    "action" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'MINOR',
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisciplinaryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisciplinaryRecord_studentId_idx" ON "DisciplinaryRecord"("studentId");

-- CreateIndex
CREATE INDEX "DisciplinaryRecord_recordedById_idx" ON "DisciplinaryRecord"("recordedById");

-- CreateIndex
CREATE INDEX "DisciplinaryRecord_studentId_createdAt_idx" ON "DisciplinaryRecord"("studentId", "createdAt");

-- AddForeignKey
ALTER TABLE "DisciplinaryRecord" ADD CONSTRAINT "DisciplinaryRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryRecord" ADD CONSTRAINT "DisciplinaryRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
