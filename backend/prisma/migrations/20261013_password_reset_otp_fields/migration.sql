ALTER TABLE "User"
  ADD COLUMN "passwordResetOtpHash" TEXT,
  ADD COLUMN "passwordResetOtpExpiresAt" TIMESTAMP(3),
  ADD COLUMN "passwordResetOtpUsedAt" TIMESTAMP(3);
