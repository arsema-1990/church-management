import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import {
  EMAIL_OTP_LIFETIME_MS,
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_MAX_RESENDS,
  EMAIL_OTP_RESEND_COOLDOWN_MS,
  EMAIL_OTP_RESEND_WINDOW_MS,
  checkEmailOtp,
  emailVerificationAccessAllowed,
  generateEmailOtp,
  getEmailOtpResendStatus,
  persistOtpAndDeliver,
} from './services/emailVerification.js';

test('generates secure six-digit codes including leading zeroes', () => {
  for (let i = 0; i < 100; i++) assert.match(generateEmailOtp(), /^\d{6}$/);
});

test('accepts a correct unexpired code and rejects incorrect, expired, used, and locked codes', async () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  const otpHash = await bcrypt.hash('001234', 4);
  const record = {
    emailVerified: false,
    otpHash,
    expiresAt: new Date(now.getTime() + EMAIL_OTP_LIFETIME_MS),
    attempts: 0,
  };

  assert.deepEqual(await checkEmailOtp('001234', record, now), { ok: true });
  assert.deepEqual(await checkEmailOtp('999999', record, now), { ok: false, reason: 'invalid' });
  assert.deepEqual(await checkEmailOtp('001234', { ...record, expiresAt: now }, now), { ok: false, reason: 'expired' });
  assert.deepEqual(await checkEmailOtp('001234', { ...record, emailVerified: true }, now), { ok: false, reason: 'already-verified' });
  assert.deepEqual(await checkEmailOtp('001234', { ...record, attempts: EMAIL_OTP_MAX_ATTEMPTS }, now), { ok: false, reason: 'locked' });
});

test('enforces resend cooldown and per-account resend-window limits', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  const withinCooldown = getEmailOtpResendStatus({
    lastSentAt: new Date(now.getTime() - EMAIL_OTP_RESEND_COOLDOWN_MS + 1),
    resendCount: 0,
    resendWindowStartedAt: now,
    now,
  });
  assert.deepEqual(withinCooldown, { allowed: false, reason: 'cooldown', retryAfterSeconds: 1 });

  const atLimit = getEmailOtpResendStatus({
    lastSentAt: new Date(now.getTime() - EMAIL_OTP_RESEND_COOLDOWN_MS),
    resendCount: EMAIL_OTP_MAX_RESENDS,
    resendWindowStartedAt: now,
    now,
  });
  assert.equal(atLimit.allowed, false);
  if (!atLimit.allowed) assert.equal(atLimit.reason, 'limit');

  const afterWindow = getEmailOtpResendStatus({
    lastSentAt: new Date(now.getTime() - EMAIL_OTP_RESEND_WINDOW_MS - 1),
    resendCount: EMAIL_OTP_MAX_RESENDS,
    resendWindowStartedAt: new Date(now.getTime() - EMAIL_OTP_RESEND_WINDOW_MS - 1),
    now,
  });
  assert.deepEqual(afterWindow, { allowed: true, windowStartedAt: now, resendCount: 1 });
});

test('only reports successful OTP delivery and clears a code after mail delivery fails', async () => {
  let storedOtp: string | null = null;
  let deliveryResult = false;
  const delivered = await persistOtpAndDeliver({
    persist: async () => { storedOtp = 'hashed-code'; },
    send: async () => deliveryResult,
    clear: async () => { storedOtp = null; },
  });

  assert.equal(delivered, false);
  assert.equal(storedOtp, null);

  deliveryResult = true;
  const resent = await persistOtpAndDeliver({
    persist: async () => { storedOtp = 'new-hashed-code'; },
    send: async () => deliveryResult,
    clear: async () => { storedOtp = null; },
  });
  assert.equal(resent, true);
  assert.equal(storedOtp, 'new-hashed-code');
});

test('requires email verification before protected access', () => {
  assert.equal(emailVerificationAccessAllowed(false), false);
  assert.equal(emailVerificationAccessAllowed(true), true);
});
