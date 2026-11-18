-- Remove marriage-specific request, certificate, notification, and history data.
BEGIN;

DELETE FROM "Certificate"
WHERE "type"::text = 'MARRIAGE'
   OR "requestId" IN (
     SELECT "id" FROM "PortalRequest" WHERE "type"::text = 'MARRIAGE'
   );

DELETE FROM "PortalRequest" WHERE "type"::text = 'MARRIAGE';
DELETE FROM "Notification" WHERE "category" = 'marriage';
DROP TABLE IF EXISTS "Marriage";

CREATE TYPE "RequestType_new" AS ENUM ('COURSE_CERTIFICATE', 'BAPTISM');
ALTER TABLE "PortalRequest"
  ALTER COLUMN "type" TYPE "RequestType_new"
  USING ("type"::text::"RequestType_new");
DROP TYPE "RequestType";
ALTER TYPE "RequestType_new" RENAME TO "RequestType";

CREATE TYPE "CertificateType_new" AS ENUM ('COURSE', 'BAPTISM');
ALTER TABLE "Certificate"
  ALTER COLUMN "type" TYPE "CertificateType_new"
  USING ("type"::text::"CertificateType_new");
DROP TYPE "CertificateType";
ALTER TYPE "CertificateType_new" RENAME TO "CertificateType";

COMMIT;
