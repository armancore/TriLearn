CREATE TABLE "InstructorDepartmentMembership" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstructorDepartmentMembership_pkey" PRIMARY KEY ("id")
);

INSERT INTO "InstructorDepartmentMembership" ("id", "instructorId", "departmentId", "createdAt")
SELECT
    gen_random_uuid()::text,
    source."instructorId",
    source."departmentId",
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT
        i."id" AS "instructorId",
        d."id" AS "departmentId"
    FROM "Instructor" i
    CROSS JOIN LATERAL unnest(i."departments") AS department_name
    JOIN "Department" d
        ON d."name" = btrim(department_name)
    WHERE department_name IS NOT NULL
        AND btrim(department_name) <> ''
) source;

CREATE UNIQUE INDEX "InstructorDepartmentMembership_instructorId_departmentId_key"
ON "InstructorDepartmentMembership"("instructorId", "departmentId");

CREATE INDEX "InstructorDepartmentMembership_instructorId_idx"
ON "InstructorDepartmentMembership"("instructorId");

CREATE INDEX "InstructorDepartmentMembership_departmentId_idx"
ON "InstructorDepartmentMembership"("departmentId");

ALTER TABLE "InstructorDepartmentMembership"
ADD CONSTRAINT "InstructorDepartmentMembership_instructorId_fkey"
FOREIGN KEY ("instructorId") REFERENCES "Instructor"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstructorDepartmentMembership"
ADD CONSTRAINT "InstructorDepartmentMembership_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Instructor" DROP COLUMN "departments";
