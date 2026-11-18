ALTER TABLE "Certificate"
  ADD COLUMN "courseId" TEXT,
  ADD COLUMN "courseTitleSnapshot" TEXT;

CREATE UNIQUE INDEX "Certificate_personId_courseId_key"
  ON "Certificate"("personId", "courseId");

CREATE INDEX "Certificate_courseId_idx"
  ON "Certificate"("courseId");

ALTER TABLE "Certificate"
  ADD CONSTRAINT "Certificate_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;