import { Router } from 'express';
import bcrypt from 'bcrypt';
import { createHmac, randomBytes, randomInt } from 'node:crypto';
import tls from 'node:tls';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { UserRole } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { allowRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { uploadProfilePhoto } from '../middleware/profilePhoto.js';
import { assignMemberToAvailableHomeCell } from '../services/homeCellAssignment.js';
import {
  EMAIL_OTP_LIFETIME_MS,
  EMAIL_OTP_MAX_ATTEMPTS,
  checkEmailOtp,
  emailVerificationAccessAllowed,
  generateEmailOtp,
  getEmailOtpResendStatus,
  hashEmailOtp,
  persistOtpAndDeliver,
} from '../services/emailVerification.js';

const router = Router();
const asParamString = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? '';
const passwordVersion = (hash: string) => createHmac('sha256', process.env.JWT_SECRET ?? '').update(hash).digest('hex');
class DuplicateRegistrationEmailError extends Error {}

router.use('/password-reset', rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false }));
const verificationEmailSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(254).transform(value => value.toLowerCase()),
});

// ── Public: worshiper self-registration ──────────────────────────────────────
const registration = z.object({
  firstName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email('Invalid email address.').max(254).transform(v => v.toLowerCase()).refine(v => v.endsWith('@gmail.com'), 'Invalid email address.'),
  phone: z.string().trim().max(40).refine(value => !value || isValidPhoneNumber(value), 'Enter a valid phone number for the selected country.').optional(),
  officeTelephone: z.string().trim().max(40).regex(/^\+?[\d\s().-]{7,40}$/,'Enter a valid phone number.').or(z.literal('')).optional(),
  homeTelephone: z.string().trim().max(40).regex(/^\+?[\d\s().-]{7,40}$/,'Enter a valid phone number.').or(z.literal('')).optional(),
  gender: z.string().max(30).optional(),
  dateOfBirth: z.coerce.date().refine(date => {
    const limit = new Date(); limit.setFullYear(limit.getFullYear() - 15); limit.setDate(limit.getDate() - 1);
    return date <= limit;
  }, 'You must be older than 15 to register.'),
  placeOfBirth: z.string().max(100).optional(),
  photoUrl: z.string().max(300).regex(/^\/uploads\/profiles\/[A-Za-z0-9._-]+$/).optional(),
  maritalStatus: z.string().max(40).optional(),
  nationality: z.string().max(80).optional(),
  educationalLevel: z.string().max(100).optional(),
  occupation: z.string().max(100).optional(),
  makingALiving: z.string().max(100).optional(),
  acceptedJesus: z.enum(['Yes','No']),
  denomination: z.enum(['Protestant','Orthodox','Catholic']).optional(),
  memberOfThisChurch: z.enum(['Yes','No']).optional(),
  password: z.string().min(10).max(100).regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Include an uppercase letter, a lowercase letter, and a number.'),
  yearReceivedLord: z.string().max(10).optional(),
  yearBaptized: z.string().max(10).optional(),
  membershipYears: z.string().max(10).optional(),
  previousChurch: z.string().max(5).optional(),
  previousChurchName: z.string().max(200).optional(),
  sharesHomeAssociation: z.string().max(5).optional(),
  homeAssociationReason: z.string().max(300).optional(),
  sharesWhoseHouse: z.string().max(200).optional(),
  unionLeaderName: z.string().max(200).optional(),
  currentService: z.string().max(1000).optional(),
  pastService: z.string().max(1000).optional(),
  serviceLoad: z.string().max(1000).optional(),
  familySize: z.string().max(10).optional(),
  numberOfChildren: z.string().max(10).optional(),
  childrenKnowLord: z.string().max(10).optional(),
  poorNotKnowLord: z.string().max(10).optional(),
  unemployedInHousehold: z.string().max(10).optional(),
  registrationMonth: z.string().max(30).optional(),
}).superRefine((data, ctx) => {
  if (data.acceptedJesus === 'Yes' && !data.denomination) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['denomination'], message: 'Choose your Christian denomination.' });
  }
  if (data.denomination === 'Protestant' && !data.memberOfThisChurch) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['memberOfThisChurch'], message: 'Choose Yes or No.' });
  }
});

router.post('/register', validateBody(registration), async (req, res) => {
  const data = req.body as z.infer<typeof registration>;
  const { password, ...personFields } = data;
  const passwordHash = await bcrypt.hash(password, 12);
  const otp = generateEmailOtp();
  const otpHash = await hashEmailOtp(otp);
  const otpSentAt = new Date();
  try {
    const user = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${data.email})) IS NOT NULL AS locked`;
      const existingEmail = await tx.user.findFirst({ where: { email: { equals: data.email, mode: 'insensitive' } }, select: { id: true } });
      if (existingEmail) throw new DuplicateRegistrationEmailError();
      const person = await tx.person.create({
        data: {
          ...personFields,
          status: 'Active',
          middleName: personFields.middleName || null,
          phone: personFields.phone || null,
          gender: personFields.gender || null,
          dateOfBirth: personFields.dateOfBirth || null,
          maritalStatus: personFields.maritalStatus || null,
          nationality: personFields.nationality || null,
          occupation: personFields.occupation || null,
        },
      });
      const priorMember = person.denomination === 'Protestant' && person.memberOfThisChurch === 'Yes';
      if (priorMember) {
        const member = await tx.member.create({
          data: {
            personId: person.id,
            membershipNumber: `MEM-${randomBytes(5).toString('hex').toUpperCase()}`,
          },
        });
        await assignMemberToAvailableHomeCell(tx, member.id);
      }
      return tx.user.create({
        data: {
          username: data.email,
          email: data.email,
          passwordHash,
          role: priorMember ? UserRole.MEMBER : UserRole.WORSHIPER,
          isActive: true,
          emailVerified: false,
          emailVerificationOtpHash: otpHash,
          emailVerificationOtpExpiresAt: new Date(otpSentAt.getTime() + EMAIL_OTP_LIFETIME_MS),
          emailVerificationAttempts: 0,
          emailVerificationLastSentAt: otpSentAt,
          emailVerificationResendCount: 0,
          emailVerificationResendWindowStartedAt: otpSentAt,
          personId: person.id,
        },
        include: { person: true },
      });
    });
    const emailSent = await persistOtpAndDeliver({
      persist: async () => undefined,
      send: () => sendOtpEmail({
        toEmail: user.email,
        toName: [user.person?.firstName, user.person?.lastName].filter(Boolean).join(' ').trim() || user.username,
        otp,
        purpose: 'email-verification',
      }),
      clear: async () => {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerificationOtpHash: null, emailVerificationOtpExpiresAt: null },
        });
      },
    });
    if (!emailSent) {
      return res.status(502).json({
        ok: false,
        code: 'EMAIL_DELIVERY_FAILED',
        accountCreated: true,
        email: user.email,
        error: 'Your account was created, but we could not send the verification code. Use the resend option to try again.',
      });
    }
    return res.status(201).json({
      ok: true,
      email: user.email,
      message: 'Your account was created. Check your email for the verification code.',
    });
  } catch (error) {
    if (error instanceof DuplicateRegistrationEmailError) {
      return res.status(409).json({ error: 'An account already exists for this email address.' });
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'An account already exists for this email address.' });
    }
    console.error('Registration failed:', error);
    return res.status(500).json({ error: 'Registration could not be completed. Please try again.' });
  }
});

router.post('/profile-photo', uploadProfilePhoto.single('photo'), (req, res) => {
  if (!req.file) return res.status(422).json({ error: 'Choose a profile photo to upload.' });
  return res.status(201).json({ photoUrl: `/uploads/profiles/${req.file.filename}` });
});

// ── Public: login ─────────────────────────────────────────────────────────────
router.post(
  '/login',
  validateBody(z.object({ email: z.string().trim().min(1).email('Enter a valid email address.').max(254), password: z.string().min(1) })),
  async (req, res) => {
    const email = String(req.body.email).toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ email }, { username: email }] },
      include: { person: true },
    });
    const gmailAddress = email.endsWith('@gmail.com');
    const staffAccount = user && ([UserRole.ADMINISTRATOR, UserRole.CHURCH_MANAGER, UserRole.CLASS_INSTRUCTOR] as UserRole[]).includes(user.role);
    if (!gmailAddress && !staffAccount) {
      return res.status(422).json({ error: 'Invalid email address.' });
    }
    if (!user?.isActive || !(await bcrypt.compare(String(req.body.password), user.passwordHash))) {
      return res.status(401).json({ error: 'Email or password was not recognized.' });
    }
    if (!emailVerificationAccessAllowed(user.emailVerified)) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Verify your email address before signing in.',
      });
    }
    return res.json({
      token: signToken(user.id, user.role),
      user: {
        id: user.id,
        role: user.role,
        person: user.person,
        mustChangePassword: user.mustChangePassword,
      },
    });
  },
);

// ── Public: password reset with Brevo direct password dispatch ─────────────────
function generateTemporaryPassword(): string {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%&*';

  const chars = [
    uppers[randomInt(uppers.length)],
    lowers[randomInt(lowers.length)],
    numbers[randomInt(numbers.length)],
    symbols[randomInt(symbols.length)],
  ];
  const all = uppers + lowers + numbers + symbols;
  for (let i = chars.length; i < 11; i++) {
    chars.push(all[randomInt(all.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function generateOtp(): string {
  return String(randomInt(100000, 1000000)).padStart(6, '0');
}

async function sendOtpEmail({
  toEmail,
  toName,
  otp,
  purpose = 'password-reset',
}: {
  toEmail: string;
  toName: string;
  otp: string;
  purpose?: 'password-reset' | 'email-verification';
}) {
  const emailProvider = (process.env.EMAIL_PROVIDER ?? 'brevo').trim().toLowerCase();
  const gmailUser = (process.env.GMAIL_USER ?? '').trim();
  const gmailAppPassword = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g, '');
  const apiKey = (process.env.BREVO_API_KEY || process.env.RESEND_API_KEY || '').trim();

  const from = process.env.EMAIL_FROM || process.env.MAIL_FROM || 'Grace Evangelical Church <aremahailu465@gmail.com>';
  const senderMatch = from.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  const preferredSender = senderMatch && senderMatch[1] && senderMatch[2]
    ? { name: senderMatch[1].trim() || 'Grace Evangelical Church', email: senderMatch[2].trim() }
    : { name: 'Grace Evangelical Church', email: from.trim() };

  const isEmailVerification = purpose === 'email-verification';
  const subject = isEmailVerification
    ? 'Verify your email - Grace Evangelical Church'
    : 'Your password reset code - Grace Evangelical Church';
  const heading = isEmailVerification ? 'Email Verification Code' : 'Password Reset Code';
  const instruction = isEmailVerification
    ? `Use this code to verify the email address for your account (${toEmail}).`
    : `We received a request to reset the password for your account (${toEmail}).`;
  const closing = isEmailVerification
    ? 'If you did not create this account, you can ignore this message.'
    : 'If you did not request this reset, you can ignore this email.';
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
  const safeName = escapeHtml(toName);
  const textContent = `Grace Evangelical Church
${heading}

Hello ${toName},

${instruction}
Your one-time code is:

${otp}

This code expires in 5 minutes. ${closing}

Grace Evangelical Church`;

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#123b68,#2563eb);padding:24px 28px;color:#fff;">
        <h2 style="margin:0;font-size:22px;">Grace Evangelical Church</h2>
        <p style="margin:8px 0 0;color:#dbeafe;">${escapeHtml(heading)}</p>
      </div>
      <div style="padding:28px;">
        <p style="margin:0 0 12px;font-size:16px;">Hello ${safeName},</p>
        <p style="margin:0 0 20px;line-height:1.6;color:#334155;">${escapeHtml(instruction)}</p>
        <div style="text-align:center;border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px;padding:22px;margin:20px 0;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#1d4ed8;font-weight:700;">Your code</div>
          <div style="font-size:32px;letter-spacing:8px;font-weight:700;padding-top:10px;color:#0f172a;">${otp}</div>
        </div>
        <p style="margin:0;color:#475569;line-height:1.6;">This code expires in 5 minutes. ${escapeHtml(closing)}</p>
      </div>
    </div>
  </body>
</html>`;

  try {
    if (emailProvider === 'console') {
      console.log('--------------------------------------------------');
      console.log(`[Email Mock / Console] ${heading} to: ${toEmail} (${toName})`);
      console.log(`[Email Mock / Console] Code: ${otp}`);
      console.log('--------------------------------------------------');
      return true;
    }

    if (emailProvider === 'emailjs') {
      const serviceId = (process.env.EMAILJS_SERVICE_ID ?? '').trim();
      const templateId = (
        (isEmailVerification
          ? process.env.EMAILJS_VERIFICATION_TEMPLATE_ID
          : process.env.EMAILJS_PASSWORD_RESET_TEMPLATE_ID) ||
        process.env.EMAILJS_TEMPLATE_ID ||
        ''
      ).trim();
      const publicKey = (process.env.EMAILJS_PUBLIC_KEY ?? process.env.EMAILJS_USER_ID ?? '').trim();
      const privateKey = (process.env.EMAILJS_PRIVATE_KEY ?? process.env.EMAILJS_ACCESS_TOKEN ?? '').trim();

      if (!serviceId || !templateId || !publicKey) {
        console.error('[EmailJS] EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, and EMAILJS_PUBLIC_KEY must be configured.');
        return false;
      }

      const payload: Record<string, unknown> = {
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          to_name: toName,
          name: toName,
          to_email: toEmail,
          email: toEmail,
          otp,
          code: otp,
          passcode: otp,
          purpose,
          subject,
          heading,
          instruction,
          message: textContent,
          html_message: htmlContent,
        },
      };

      if (privateKey) {
        payload.accessToken = privateKey;
      }

      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json, text/plain, */*',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[EmailJS] Delivery failed with HTTP ${response.status}: ${errorText}`);
        return false;
      }
      return true;
    }

    if (emailProvider === 'gmail') {
      if (!gmailUser || !gmailAppPassword) {
        console.error('[Gmail SMTP] GMAIL_USER and GMAIL_APP_PASSWORD must be configured.');
        return false;
      }
      const systemCaCertificates = typeof tls.getCACertificates === 'function'
        ? tls.getCACertificates('system')
        : [];
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailAppPassword },
        ...(systemCaCertificates.length > 0
          ? { tls: { ca: [...tls.getCACertificates('default'), ...systemCaCertificates] } }
          : {}),
      });
      await transporter.sendMail({
        from: `Grace Evangelical Church <${gmailUser}>`,
        to: { name: toName, address: toEmail },
        subject,
        text: textContent,
        html: htmlContent,
      });
      return true;
    }

    if (emailProvider !== 'brevo') {
      console.error(`[Password Reset Email] Unsupported EMAIL_PROVIDER: ${emailProvider}`);
      return false;
    }
    if (!apiKey) {
      console.error('[Brevo] BREVO_API_KEY or RESEND_API_KEY is not configured.');
      return false;
    }
    const effectiveSender = await resolveBrevoSender(apiKey, preferredSender.email, preferredSender.name);
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: effectiveSender,
        to: [{ email: toEmail, name: toName }],
        replyTo: preferredSender,
        subject,
        htmlContent,
        textContent,
        headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All', 'X-Priority': '3' },
      }),
    });
    if (!response.ok) {
      console.error(`[Brevo] Password reset email rejected with HTTP ${response.status}.`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[Password Reset Email] ${emailProvider} delivery failed:`, error instanceof Error ? error.message : error);
    return false;
  }
}

// Helper to get verified sender from Brevo API to guarantee delivery
async function resolveBrevoSender(apiKey: string, preferredEmail: string, preferredName: string): Promise<{ name: string; email: string }> {
  try {
    const res = await fetch('https://api.brevo.com/v3/senders', {
      headers: { 'api-key': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as { senders?: Array<{ id: number; name: string; email: string; active?: boolean }> };
      const senders = data.senders || [];
      const exact = senders.find(s => s.email.toLowerCase() === preferredEmail.toLowerCase() && s.active !== false);
      if (exact) {
        return { name: preferredName || exact.name, email: exact.email };
      }
      const active = senders.find(s => s.active !== false);
      if (active) {
        console.log(`[Brevo Deliverability] Sender '${preferredEmail}' not matched. Utilizing verified account sender '${active.email}' to guarantee inbox delivery.`);
        return { name: preferredName || active.name, email: active.email };
      }
    }
  } catch {
    // Fall back to preferred sender
  }
  return { name: preferredName || 'Grace Evangelical Church', email: preferredEmail };
}

router.post(
  '/email-verification/verify',
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'Too many verification attempts. Please try again later.' }),
  }),
  validateBody(verificationEmailSchema.extend({ otp: z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit verification code.') })),
  async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { email: req.body.email },
      select: {
        id: true,
        emailVerified: true,
        emailVerificationOtpHash: true,
        emailVerificationOtpExpiresAt: true,
        emailVerificationAttempts: true,
      },
    });
    if (!user) return res.status(400).json({ error: 'The verification code is invalid or expired. Request a new code.' });

    const check = await checkEmailOtp(req.body.otp, {
      emailVerified: user.emailVerified,
      otpHash: user.emailVerificationOtpHash,
      expiresAt: user.emailVerificationOtpExpiresAt,
      attempts: user.emailVerificationAttempts,
    });
    if (!check.ok) {
      if (check.reason === 'expired') {
        await prisma.user.updateMany({
          where: { id: user.id, emailVerificationOtpHash: user.emailVerificationOtpHash },
          data: { emailVerificationOtpHash: null, emailVerificationOtpExpiresAt: null },
        });
        return res.status(400).json({ error: 'This verification code has expired. Request a new one.' });
      }
      if (check.reason === 'invalid') {
        const attempts = user.emailVerificationAttempts + 1;
        await prisma.user.updateMany({
          where: { id: user.id, emailVerified: false, emailVerificationOtpHash: user.emailVerificationOtpHash },
          data: { emailVerificationAttempts: { increment: 1 } },
        });
        return res.status(400).json({
          error: attempts >= EMAIL_OTP_MAX_ATTEMPTS
            ? 'Too many incorrect codes. Request a new verification code.'
            : 'That verification code is incorrect. Please try again.',
        });
      }
      if (check.reason === 'locked') {
        return res.status(429).json({ error: 'Too many incorrect codes. Request a new verification code.' });
      }
      if (check.reason === 'already-verified') {
        return res.status(409).json({ error: 'This email address has already been verified.' });
      }
      return res.status(400).json({ error: 'No active verification code. Request a new one.' });
    }

    const result = await prisma.user.updateMany({
      where: {
        id: user.id,
        emailVerified: false,
        emailVerificationOtpHash: user.emailVerificationOtpHash,
        emailVerificationOtpExpiresAt: { gt: new Date() },
        emailVerificationAttempts: { lt: EMAIL_OTP_MAX_ATTEMPTS },
      },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationOtpHash: null,
        emailVerificationOtpExpiresAt: null,
        emailVerificationAttempts: 0,
      },
    });
    if (result.count !== 1) {
      return res.status(409).json({ error: 'This verification code has already been used or replaced. Request a new one.' });
    }
    return res.json({ ok: true, message: 'Your email address has been verified. You can now sign in.' });
  },
);

router.post(
  '/email-verification/resend',
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'Too many verification code requests. Please try again later.' }),
  }),
  validateBody(verificationEmailSchema),
  async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { email: req.body.email },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerified: true,
        emailVerificationLastSentAt: true,
        emailVerificationResendCount: true,
        emailVerificationResendWindowStartedAt: true,
        person: { select: { firstName: true, lastName: true } },
      },
    });
    if (!user || user.emailVerified) {
      return res.json({
        ok: true,
        message: 'If this address belongs to an unverified account, a verification code can be requested.',
      });
    }

    const now = new Date();
    const resend = getEmailOtpResendStatus({
      lastSentAt: user.emailVerificationLastSentAt,
      resendCount: user.emailVerificationResendCount,
      resendWindowStartedAt: user.emailVerificationResendWindowStartedAt,
      now,
    });
    if (!resend.allowed) {
      const message = resend.reason === 'cooldown'
        ? `Please wait ${resend.retryAfterSeconds} seconds before requesting another code.`
        : 'Too many verification codes have been requested. Try again later.';
      return res.status(429).json({ error: message, retryAfterSeconds: resend.retryAfterSeconds });
    }

    const otp = generateEmailOtp();
    const otpHash = await hashEmailOtp(otp);
    const expiresAt = new Date(now.getTime() + EMAIL_OTP_LIFETIME_MS);
    const emailSent = await persistOtpAndDeliver({
      persist: async () => {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerificationOtpHash: otpHash,
            emailVerificationOtpExpiresAt: expiresAt,
            emailVerificationAttempts: 0,
            emailVerificationLastSentAt: now,
            emailVerificationResendCount: resend.resendCount,
            emailVerificationResendWindowStartedAt: resend.windowStartedAt,
          },
        });
      },
      send: () => sendOtpEmail({
        toEmail: user.email,
        toName: [user.person?.firstName, user.person?.lastName].filter(Boolean).join(' ').trim() || user.username,
        otp,
        purpose: 'email-verification',
      }),
      clear: async () => {
        await prisma.user.updateMany({
          where: { id: user.id, emailVerificationOtpHash: otpHash },
          data: { emailVerificationOtpHash: null, emailVerificationOtpExpiresAt: null },
        });
      },
    });
    if (!emailSent) {
      return res.status(502).json({
        code: 'EMAIL_DELIVERY_FAILED',
        error: 'We could not send the verification code. Please wait before trying again or contact the church office.',
      });
    }
    return res.json({ ok: true, message: 'A new verification code has been sent to your email.' });
  },
);

router.post(
  '/password-reset/request',
  validateBody(z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()) })),
  async (req, res) => {
    const email = String(req.body.email).trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email, isActive: true },
      include: { person: true },
    });

    if (!user) {
      return res.json({ ok: true, message: 'If an account exists with that email, a 6-digit verification code has been sent.' });
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 12);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetOtpHash: otpHash,
        passwordResetOtpExpiresAt: expiresAt,
        passwordResetOtpUsedAt: null,
      },
    });

    const recipientName = [user.person?.firstName, user.person?.lastName].filter(Boolean).join(' ').trim() || user.username;
    const emailSent = await sendOtpEmail({ toEmail: user.email, toName: recipientName, otp });
    if (!emailSent) {
      return res.status(502).json({
        ok: false,
        code: 'EMAIL_DELIVERY_FAILED',
        error: 'We could not send your verification code right now. Please wait a moment and try again. If the problem continues, contact the church office.',
      });
    }

    return res.json({ ok: true, message: 'A 6-digit verification code has been sent to your email.' });
  },
);

router.post(
  '/password-reset/verify',
  validateBody(z.object({
    email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
    otp: z.string().trim().regex(/^\d{6}$/),
  })),
  async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { email: req.body.email, isActive: true },
      select: { id: true, passwordResetOtpHash: true, passwordResetOtpExpiresAt: true },
    });

    if (!user?.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      return res.status(400).json({ error: 'No verification code is active for this email. Request a new one.' });
    }

    if (new Date(user.passwordResetOtpExpiresAt).getTime() < Date.now()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetOtpHash: null, passwordResetOtpExpiresAt: null },
      });
      return res.status(400).json({ error: 'This verification code has expired. Request a new one.' });
    }

    const isValid = await bcrypt.compare(req.body.otp, user.passwordResetOtpHash);
    if (!isValid) {
      return res.status(400).json({ error: 'The verification code is invalid.' });
    }

    return res.json({ ok: true, message: 'Your identity has been verified.' });
  },
);

router.post(
  '/password-reset/complete',
  validateBody(z.object({
    email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
    otp: z.string().trim().regex(/^\d{6}$/),
    password: z.string().min(10).max(100).regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  })),
  async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { email: req.body.email, isActive: true },
      select: {
        id: true,
        passwordHash: true,
        passwordResetOtpHash: true,
        passwordResetOtpExpiresAt: true,
      },
    });

    if (!user?.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      return res.status(400).json({ error: 'Please request a fresh OTP before resetting your password.' });
    }

    if (new Date(user.passwordResetOtpExpiresAt).getTime() < Date.now()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetOtpHash: null, passwordResetOtpExpiresAt: null, passwordResetOtpUsedAt: null },
      });
      return res.status(400).json({ error: 'This verification code has expired. Request a new one.' });
    }

    const isValid = await bcrypt.compare(req.body.otp, user.passwordResetOtpHash);
    if (!isValid) {
      return res.status(400).json({ error: 'The verification code is invalid.' });
    }

    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordResetOtpHash: null,
        passwordResetOtpExpiresAt: null,
        passwordResetOtpUsedAt: null,
      },
    });

    return res.json({ ok: true, message: 'Your password has been reset successfully.' });
  },
);

// ── Auth check ────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.auth!.userId },
    select: { id: true, username: true, email: true, role: true, mustChangePassword: true, person: true },
  });
  return res.json({ user });
});

// ── Change own password (used for force-change flow) ─────────────────────────
router.post(
  '/change-password',
  requireAuth,
  validateBody(z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10).max(100).regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Include an uppercase letter, a lowercase letter, and a number.'),
  })),
  async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
    if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    if (req.body.newPassword === req.body.currentPassword) {
      return res.status(422).json({ error: 'New password must be different from the current password.' });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(req.body.newPassword, 12), mustChangePassword: false },
    });
    return res.json({ ok: true, message: 'Password changed successfully.' });
  },
);

// ════════════════════════════════════════════════════════════════════
// ADMINISTRATOR-ONLY: managed account operations
// ════════════════════════════════════════════════════════════════════

// ── List managed accounts ────────────────────────────────────────────────────
router.get('/users', requireAuth, allowRoles(UserRole.ADMINISTRATOR), async (_req, res) => {
  const users = await prisma.user.findMany({
    where: {
      role: { in: [UserRole.CHURCH_MANAGER, UserRole.CLASS_INSTRUCTOR] },
    },
    select: {
      id: true, username: true, email: true, role: true,
      isActive: true, mustChangePassword: true, createdAt: true,
      person: { select: { id: true, firstName: true, middleName: true, lastName: true, phone: true, photoUrl: true } },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
  });
  return res.json({ users });
});

// ── Get a managed account ─────────────────────────────────────────────────────
router.get('/users/:id', requireAuth, allowRoles(UserRole.ADMINISTRATOR), async (req, res) => {
  const id = asParamString(req.params.id);
  const user = await prisma.user.findFirst({
    where: { id, role: { in: [UserRole.CHURCH_MANAGER, UserRole.CLASS_INSTRUCTOR] } },
    select: {
      id: true, username: true, email: true, role: true,
      isActive: true, mustChangePassword: true, signatureData: true, createdAt: true, updatedAt: true,
      person: true,
    },
  });
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  return res.json({ user });
});

// ── Create a Church Manager or Instructor account ─────────────────────────────
const createStaffSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email().transform(v => v.toLowerCase()),
  phone: z.string().trim().min(7, 'Enter a phone number.').max(40).regex(/^\+?[\d\s().-]{7,20}$/, 'Enter a valid phone number.'),
  username: z.string().trim().min(3).max(60).optional(),
  password: z.string().min(12, 'Password must be at least 12 characters').max(100).regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Include an uppercase letter, a lowercase letter, and a number.'),
  role: z.enum(['CHURCH_MANAGER', 'CLASS_INSTRUCTOR']),
  photoUrl: z.string().url().optional().or(z.literal('')),
  signatureData: z.string().max(100_000).optional(),
  isActive: z.boolean().default(true),
  mustChangePassword: z.boolean().default(true),
});

router.post(
  '/users',
  requireAuth,
  allowRoles(UserRole.ADMINISTRATOR),
  validateBody(createStaffSchema),
  async (req, res) => {
    const data = req.body as z.infer<typeof createStaffSchema>;
    const email = data.email;
    const username = data.username?.trim() || email;

    const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
    if (existing) return res.status(409).json({ error: 'An account already exists with this email or username.' });

    const user = await prisma.$transaction(async tx => {
      const person = await tx.person.create({
        data: {
          firstName: data.firstName,
          middleName: data.middleName || null,
          lastName: data.lastName,
          email,
          phone: data.phone || null,
          photoUrl: data.photoUrl || null,
        },
      });
      const created = await tx.user.create({
        data: {
          username,
          email,
          passwordHash: await bcrypt.hash(data.password, 12),
          role: data.role as UserRole,
          isActive: data.isActive,
          mustChangePassword: data.mustChangePassword,
          signatureData: data.signatureData || null,
          personId: person.id,
        },
        include: { person: true },
      });
      // Audit log
      await tx.auditEvent.create({
        data: {
          actorId: req.auth!.userId,
          action: 'CREATE_ACCOUNT',
          entity: 'User',
          entityId: created.id,
          metadata: { role: data.role, email, createdFor: `${data.firstName} ${data.lastName}` },
        },
      });
      return created;
    });

    return res.status(201).json({
      user: {
        id: user.id, username: user.username, email: user.email,
        role: user.role, isActive: user.isActive, mustChangePassword: user.mustChangePassword,
        person: user.person, createdAt: user.createdAt,
      },
      // Return the plain password once so admin can share it — never stored again
      temporaryPassword: data.password,
    });
  },
);

// ── Edit a managed account ────────────────────────────────────────────────────
const editStaffSchema = z.object({
  email: z.string().trim().email('Enter a valid email').max(254).transform(value => value.toLowerCase()).optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  middleName: z.string().trim().max(80).nullable().optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().min(7, 'Enter a phone number.').max(40).regex(/^\+?[\d\s().-]{7,20}$/, 'Enter a valid phone number.').optional(),
  photoUrl: z.string().url().nullable().optional().or(z.literal('')),
  signatureData: z.string().max(100_000).nullable().optional(),
  isActive: z.boolean().optional(),
  role: z.enum(['CHURCH_MANAGER', 'CLASS_INSTRUCTOR']).optional(),
});

router.patch(
  '/users/:id',
  requireAuth,
  allowRoles(UserRole.ADMINISTRATOR),
  validateBody(editStaffSchema),
  async (req, res) => {
    const id = asParamString(req.params.id);
    const target = await prisma.user.findFirst({
      where: { id, role: { not: UserRole.ADMINISTRATOR } },
      include: { person: true },
    });
    if (!target) return res.status(404).json({ error: 'Staff account not found.' });

    const { email, firstName, middleName, lastName, phone, photoUrl, signatureData, isActive, role } = req.body;

    if (email && email !== target.email) {
      const [existingUser, existingPerson] = await Promise.all([
        prisma.user.findUnique({ where: { email }, select: { id: true } }),
        prisma.person.findUnique({ where: { email }, select: { id: true } }),
      ]);
      if (existingUser && existingUser.id !== target.id)
        return res.status(409).json({ error: 'An account already exists with this email.' });
      if (existingPerson && existingPerson.id !== target.personId)
        return res.status(409).json({ error: 'A person profile already exists with this email.' });
    }

    // Determine what changed for audit
    const changes: string[] = [];
    if (email && email !== target.email) changes.push('Changed email');
    if (phone !== undefined && phone !== target.person?.phone) changes.push('Changed phone');
    if (isActive !== undefined && isActive !== target.isActive)
      changes.push(isActive ? 'Activated account' : 'Deactivated account');
    if (role && role !== target.role) changes.push(`Changed role to ${role}`);

    await prisma.$transaction(async tx => {
      if (target.personId) {
        await tx.person.update({
          where: { id: target.personId },
          data: {
            ...(email !== undefined && { email }),
            ...(firstName !== undefined && { firstName }),
            ...(middleName !== undefined && { middleName }),
            ...(lastName !== undefined && { lastName }),
            ...(phone !== undefined && { phone }),
            ...(photoUrl !== undefined && { photoUrl: photoUrl || null }),
          },
        });
      }
      await tx.user.update({
        where: { id: target.id },
        data: {
          ...(email !== undefined && { email }),
          ...(isActive !== undefined && { isActive }),
          ...(role && { role: role as UserRole }),
          ...(signatureData !== undefined && { signatureData }),
        },
      });
      if (changes.length) {
        await tx.auditEvent.create({
          data: {
            actorId: req.auth!.userId,
            action: 'EDIT_ACCOUNT',
            entity: 'User',
            entityId: target.id,
            metadata: { changes, email: target.email },
          },
        });
      }
    });

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
      select: {
        id: true, username: true, email: true, role: true,
        isActive: true, mustChangePassword: true, createdAt: true,
        person: true,
      },
    });
    return res.json({ user: updated });
  },
);

// ── Reset password (admin-initiated) ─────────────────────────────────────────
router.post(
  '/users/:id/reset-password',
  requireAuth,
  allowRoles(UserRole.ADMINISTRATOR),
  validateBody(z.object({ newPassword: z.string().min(12).max(100).regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Include an uppercase letter, a lowercase letter, and a number.') })),
  async (req, res) => {
    const id = asParamString(req.params.id);
    const target = await prisma.user.findFirst({
      where: { id, role: { not: UserRole.ADMINISTRATOR } },
    });
    if (!target) return res.status(404).json({ error: 'Staff account not found.' });

    await prisma.$transaction(async tx => {
      await tx.user.update({
        where: { id: target.id },
        data: {
          passwordHash: await bcrypt.hash(req.body.newPassword, 12),
          mustChangePassword: true,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.auth!.userId,
          action: 'RESET_PASSWORD',
          entity: 'User',
          entityId: target.id,
          metadata: { email: target.email },
        },
      });
    });

    return res.json({
      ok: true,
      temporaryPassword: req.body.newPassword,
      message: 'Password reset. The user must change it on next login.',
    });
  },
);

// ── Delete a managed account ──────────────────────────────────────────────────
router.delete('/users/:id', requireAuth, allowRoles(UserRole.ADMINISTRATOR), async (req, res) => {
  const id = asParamString(req.params.id);
  const target = await prisma.user.findFirst({
    where: { id, role: { in: [UserRole.CHURCH_MANAGER, UserRole.CLASS_INSTRUCTOR] } },
    include: { person: { select: { firstName: true, lastName: true } } },
  });
  if (!target) return res.status(404).json({ error: 'Account not found.' });

  // Keep course, certificate, baptism, and audit history intact.
  const [courses, materials, certificates, baptisms, auditEvents] = await Promise.all([
    prisma.course.count({ where: { instructorId: id } }),
    prisma.courseMaterial.count({ where: { instructorId: id } }),
    prisma.certificate.count({ where: { issuerId: id } }),
    prisma.baptism.count({ where: { recordedById: id } }),
    prisma.auditEvent.count({ where: { actorId: id } }),
  ]);
  if (courses + materials + certificates + baptisms + auditEvents > 0) {
    return res.status(409).json({ error: 'This account has records that must be preserved. Deactivate it instead of deleting it.' });
  }

  await prisma.$transaction(async tx => {
    await tx.user.delete({ where: { id } });
    await tx.auditEvent.create({
      data: {
        actorId: req.auth!.userId,
        action: 'DELETE_ACCOUNT',
        entity: 'User',
        entityId: id,
        metadata: { email: target.email, role: target.role, name: [target.person?.firstName, target.person?.lastName].filter(Boolean).join(' ') },
      },
    });
  });

  return res.json({ ok: true, message: 'Staff account deleted.' });
});

// ── Audit log ─────────────────────────────────────────────────────────────────
router.get('/audit', requireAuth, allowRoles(UserRole.ADMINISTRATOR), async (_req, res) => {
  const events = await prisma.auditEvent.findMany({
    include: { actor: { select: { email: true, role: true, person: { select: { firstName: true, lastName: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return res.json({ events });
});

export default router;
