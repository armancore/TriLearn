CREATE TYPE "NoticeAudience" AS ENUM ('ALL', 'STUDENTS', 'INSTRUCTORS_ONLY');

ALTER TABLE "Notice"
ADD COLUMN "audience" "NoticeAudience" NOT NULL DEFAULT 'ALL',
ADD COLUMN "targetDepartment" TEXT,
ADD COLUMN "targetSemester" INTEGER;

CREATE INDEX "Notice_audience_idx" ON "Notice"("audience");
CREATE INDEX "Notice_targetDepartment_targetSemester_idx" ON "Notice"("targetDepartment", "targetSemester");
