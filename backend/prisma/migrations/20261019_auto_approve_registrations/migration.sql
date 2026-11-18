-- Self-registration no longer waits for manager review. Activate registrations
-- already in the old review queue and promote existing-church-member answers.
BEGIN;

UPDATE "User" AS account
SET "role" = CASE
      WHEN person."denomination" = 'Protestant' AND person."memberOfThisChurch" = 'Yes'
        THEN 'MEMBER'::"UserRole"
      ELSE 'WORSHIPER'::"UserRole"
    END,
    "isActive" = TRUE,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Person" AS person
WHERE account."personId" = person."id"
  AND person."status" = 'PENDING_APPROVAL'
  AND account."role" IN ('WORSHIPER'::"UserRole", 'MEMBER'::"UserRole");

INSERT INTO "Member" ("id", "personId", "membershipNumber", "membershipDate", "status")
SELECT
  'auto-' || md5(person."id" || clock_timestamp()::text || random()::text),
  person."id",
  'MEM-' || upper(substr(md5(person."id" || random()::text || clock_timestamp()::text), 1, 10)),
  CURRENT_TIMESTAMP,
  'Active'
FROM "Person" AS person
JOIN "User" AS account ON account."personId" = person."id"
WHERE person."status" = 'PENDING_APPROVAL'
  AND person."denomination" = 'Protestant'
  AND person."memberOfThisChurch" = 'Yes'
  AND account."role" = 'MEMBER'::"UserRole"
  AND NOT EXISTS (SELECT 1 FROM "Member" WHERE "personId" = person."id");

UPDATE "Person"
SET "status" = 'Active', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING_APPROVAL';

COMMIT;
