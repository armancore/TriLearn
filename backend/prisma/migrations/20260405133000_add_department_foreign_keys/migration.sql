UPDATE "Student" AS s
SET "department" = d."name"
FROM "Department" AS d
WHERE s."department" IS NOT NULL
  AND btrim(s."department") <> ''
  AND upper(s."department") = upper(d."code")
  AND s."department" <> d."name";

UPDATE "Instructor" AS i
SET "department" = d."name"
FROM "Department" AS d
WHERE i."department" IS NOT NULL
  AND btrim(i."department") <> ''
  AND upper(i."department") = upper(d."code")
  AND i."department" <> d."name";

UPDATE "Coordinator" AS c
SET "department" = d."name"
FROM "Department" AS d
WHERE c."department" IS NOT NULL
  AND btrim(c."department") <> ''
  AND upper(c."department") = upper(d."code")
  AND c."department" <> d."name";

UPDATE "Subject" AS s
SET "department" = d."name"
FROM "Department" AS d
WHERE s."department" IS NOT NULL
  AND btrim(s."department") <> ''
  AND upper(s."department") = upper(d."code")
  AND s."department" <> d."name";

ALTER TABLE "Student"
ADD CONSTRAINT "Student_department_fkey"
FOREIGN KEY ("department") REFERENCES "Department"("name")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Instructor"
ADD CONSTRAINT "Instructor_department_fkey"
FOREIGN KEY ("department") REFERENCES "Department"("name")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Coordinator"
ADD CONSTRAINT "Coordinator_department_fkey"
FOREIGN KEY ("department") REFERENCES "Department"("name")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Subject"
ADD CONSTRAINT "Subject_department_fkey"
FOREIGN KEY ("department") REFERENCES "Department"("name")
ON DELETE SET NULL
ON UPDATE CASCADE;
