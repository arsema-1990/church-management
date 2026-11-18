import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';

export const EMAIL_OTP_LIFETIME_MS = 5 * 60_000;
export const EMAIL_OTP_RESEND_COOLDOWN_MS = 60_000;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
export const EMAIL_OTP_RESEND_WINDOW_MS = 15 * 60_000;
export const EMAIL_OTP_MAX_RESENDS = 5;

export function emailVerificationAccessAllowed(emailVerified: boolean): boolean {
  return emailVerified;
}

export type EmailOtpRecord = {
  emailVerified: boolean;
  otpHash: string | null;
  expiresAt: Date | null;
  attempts: number;
};

export type EmailOtpCheck =
  | { ok: true }
  | { ok: false; reason: 'already-verified' | 'missing' | 'expired' | 'locked' | 'invalid' };

export function generateEmailOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function hashEmailOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 12);
}

export async function checkEmailOtp(
  otp: string,
  record: EmailOtpRecord,
  now = new Date(),
): Promise<EmailOtpCheck> {
  if (record.emailVerified) return { ok: false, reason: 'already-verified' };
  if (record.attempts >= EMAIL_OTP_MAX_ATTEMPTS) return { ok: false, reason: 'locked' };
  if (!record.otpHash || !record.expiresAt) return { ok: false, reason: 'missing' };
  if (record.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  if (!(await bcrypt.compare(otp, record.otpHash))) return { ok: false, reason: 'invalid' };
  return { ok: true };
}

export function getEmailOtpResendStatus({
  lastSentAt,
  resendCount,
  resendWindowStartedAt,
  now = new Date(),
}: {
  lastSentAt: Date | null;
  resendCount: number;
  resendWindowStartedAt: Date | null;
  now?: Date;
}): { allowed: true; windowStartedAt: Date; resendCount: number } | { allowed: false; reason: 'cooldown' | 'limit'; retryAfterSeconds: number } {
  const windowIsActive = resendWindowStartedAt !== null
    && now.getTime() - resendWindowStartedAt.getTime() < EMAIL_OTP_RESEND_WINDOW_MS;
  const windowStartedAt = windowIsActive ? resendWindowStartedAt : now;
  const currentCount = windowIsActive ? resendCount : 0;

  if (currentCount >= EMAIL_OTP_MAX_RESENDS) {
    const retryAfterSeconds = Math.ceil(
      (windowStartedAt.getTime() + EMAIL_OTP_RESEND_WINDOW_MS - now.getTime()) / 1000,
    );
    return { allowed: false, reason: 'limit', retryAfterSeconds };
  }

  if (lastSentAt) {
    const retryAfterSeconds = Math.ceil(
      (lastSentAt.getTime() + EMAIL_OTP_RESEND_COOLDOWN_MS - now.getTime()) / 1000,
    );
    if (retryAfterSeconds > 0) return { allowed: false, reason: 'cooldown', retryAfterSeconds };
  }

  return { allowed: true, windowStartedAt, resendCount: currentCount + 1 };
}

export async function persistOtpAndDeliver({
  persist,
  send,
  clear,
}: {
  persist: () => Promise<void>;
  send: () => Promise<boolean>;
  clear: () => Promise<void>;
}): Promise<boolean> {
  await persist();
  if (await send()) return true;
  await clear();
  return false;
}
