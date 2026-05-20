-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'EXTENDED';

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN "extendedDueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN "isExtended" BOOLEAN NOT NULL DEFAULT false;
