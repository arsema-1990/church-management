ALTER TABLE "CourseProgress"
  ADD COLUMN "watchedVideoSegments" JSONB NOT NULL DEFAULT '{}';