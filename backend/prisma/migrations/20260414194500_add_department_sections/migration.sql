CREATE TABLE "DepartmentSection" (
  "id" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "semester" INTEGER NOT NULL,
  "section" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DepartmentSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DepartmentSection_departmentId_semester_idx" ON "DepartmentSection"("departmentId", "semester");
CREATE INDEX "DepartmentSection_departmentId_section_idx" ON "DepartmentSection"("departmentId", "section");

CREATE UNIQUE INDEX "DepartmentSection_departmentId_semester_section_key"
ON "DepartmentSection"("departmentId", "semester", "section");

ALTER TABLE "DepartmentSection"
ADD CONSTRAINT "DepartmentSection_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
