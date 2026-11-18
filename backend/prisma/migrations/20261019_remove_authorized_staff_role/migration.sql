BEGIN;

CREATE TEMP TABLE "_StaffAccountsToRemove" ON COMMIT DROP AS
SELECT "id", "personId"
FROM "User"
WHERE "role"::text = 'AUTHORIZED_STAFF';

CREATE TEMP TABLE "_StaffBaptismPeopleToRemove" ON COMMIT DROP AS
SELECT DISTINCT baptism."personId"
FROM "Baptism" AS baptism
JOIN "_StaffAccountsToRemove" AS staff ON staff."id" = baptism."recordedById";

DELETE FROM "Notification" AS notification
USING "_StaffBaptismPeopleToRemove" AS affected, "User" AS person_user
WHERE person_user."personId" = affected."personId"
  AND notification."userId" = person_user."id"
  AND notification."category" = 'baptism'
  AND notification."title" = 'Congratulations! You are now a Member';

DELETE FROM "Certificate"
WHERE "personId" IN (SELECT "personId" FROM "_StaffBaptismPeopleToRemove")
  AND "type"::text = 'BAPTISM';

DELETE FROM "PortalRequest"
WHERE "personId" IN (SELECT "personId" FROM "_StaffBaptismPeopleToRemove")
  AND "type"::text = 'BAPTISM';

DELETE FROM "Baptism"
WHERE "recordedById" IN (SELECT "id" FROM "_StaffAccountsToRemove");

DELETE FROM "Member"
WHERE "personId" IN (SELECT "personId" FROM "_StaffBaptismPeopleToRemove");

UPDATE "User"
SET "role" = 'WORSHIPER'
WHERE "personId" IN (SELECT "personId" FROM "_StaffBaptismPeopleToRemove")
  AND "role"::text = 'MEMBER';

DELETE FROM "Person"
WHERE "id" IN (SELECT "personId" FROM "_StaffAccountsToRemove");

DELETE FROM "User"
WHERE "id" IN (SELECT "id" FROM "_StaffAccountsToRemove");

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
CREATE TYPE "UserRole_new" AS ENUM (
  'ADMINISTRATOR',
  'CHURCH_MANAGER',
  'CLASS_INSTRUCTOR',
  'WORSHIPER',
  'MEMBER'
);
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING ("role"::text::"UserRole_new");
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'WORSHIPER'::"UserRole";

COMMIT;