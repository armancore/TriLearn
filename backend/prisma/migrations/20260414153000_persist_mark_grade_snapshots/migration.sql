ALTER TABLE "Mark"
ADD COLUMN "grade" TEXT,
ADD COLUMN "gradePoint" DOUBLE PRECISION;

UPDATE "Mark"
SET
  "grade" = CASE
    WHEN "totalMarks" > 0 AND (("obtainedMarks"::double precision / "totalMarks"::double precision) * 100) >= 90 THEN 'A+'
    WHEN "totalMarks" > 0 AND (("obtainedMarks"::double precision / "totalMarks"::double precision) * 100) >= 80 THEN 'A'
    WHEN "totalMarks" > 0 AND (("obtainedMarks"::double precision / "totalMarks"::double precision) * 100) >= 70 THEN 'B+'
    WHEN "totalMarks" > 0 AND (("obtainedMarks"::double precision / "totalMarks"::double precision) * 100) >= 60 THEN 'B'
    WHEN "totalMarks" > 0 AND (("obtainedMarks"::double precision / "totalMarks"::double precision) * 100) >= 50 THEN 'C+'
    WHEN "totalMarks" > 0 AND (("obtainedMarks"::double precision / "totalMarks"::double precision) * 100) >= 40 THEN 'C'
    ELSE 'F'
  END,
  "gradePoint" = CASE
    WHEN "totalMarks" > 0 AND (("obtainedMarks"::double precision / "totalMarks"::double precision) * 100) >= 90 THEN 4.0
    WHEN "totalMarks" > 0 AND (("obtainedMarks"::double precision / "totalMarks"::double precision) * 100) >= 80 THEN 3.6
    WHEN "totalMarks" > 0 AND (("obtainedMarks"::double precision / "totalMarks"::double precision) * 100) >= 70 THEN 3.2
    WHEN "totalMarks" > 0 AND (("obtainedMarks"::double precision / "totalMarks"::double precision) * 100) >= 60 THEN 2.8
    WHEN "totalMarks" > 0 AND (("obtainedMarks"::double precision / "totalMarks"::double precision) * 100) >= 50 THEN 2.4
    WHEN "totalMarks" > 0 AND (("obtainedMarks"::double precision / "totalMarks"::double precision) * 100) >= 40 THEN 2.0
    ELSE 0.0
  END;

ALTER TABLE "Mark"
ALTER COLUMN "grade" SET NOT NULL,
ALTER COLUMN "gradePoint" SET NOT NULL;
