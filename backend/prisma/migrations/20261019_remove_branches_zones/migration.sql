-- Remove the Branch and Zone organizational layers while preserving member
-- records and Home Cells. Their former branch/zone assignments are discarded.
ALTER TABLE "Member" DROP CONSTRAINT IF EXISTS "Member_branchId_fkey";
ALTER TABLE "Member" DROP COLUMN IF EXISTS "branchId";

ALTER TABLE "HomeCell" DROP CONSTRAINT IF EXISTS "HomeCell_zoneId_fkey";
ALTER TABLE "HomeCell" DROP COLUMN IF EXISTS "zoneId";

DROP TABLE IF EXISTS "Zone";
DROP TABLE IF EXISTS "Branch";
