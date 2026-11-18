import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

process.env.EMAIL_PROVIDER = 'brevo';
process.env.BREVO_API_KEY = 'local-automated-test-key';
process.env.EMAIL_FROM = 'Verification Test <sender@example.invalid>';
process.env.JWT_SECRET = 'automated-email-verification-test-secret-32-characters';

const originalFetch = globalThis.fetch;
const capturedEmails: Array<{ to: Array<{ email: string }>; textContent: string }> = [];
let failNextEmail = false;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.pathname === '/v3/senders') {
    return Response.json({ senders: [{ id: 1, name: 'Verification Test', email: 'sender@example.invalid', active: true }] });
  }
  if (url.pathname === '/v3/smtp/email') {
    const payload = JSON.parse(String(init?.body)) as typeof capturedEmails[number];
    if (failNextEmail) {
      failNextEmail = false;
      return new Response('delivery rejected', { status: 503 });
    }
    capturedEmails.push(payload);
    return new Response(null, { status: 201 });
  }
  throw new Error(`Unexpected external request: ${url.origin}${url.pathname}`);
};

test('registration, delivery failure, OTP lifecycle, resend, login, and protected access', async () => {
  const [{ app }, { prisma }, { signToken }] = await Promise.all([
    import('./app.js'),
    import('./prisma.js'),
    import('./middleware/auth.js'),
  ]);
  const emails = new Set<string>();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function call(method: string, path: string, body?: unknown, token?: string) {
    return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = httpRequest(new URL(path, baseUrl), {
        method,
        headers: {
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      }, response => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { responseBody += chunk; });
        response.on('end', () => {
          try {
            resolve({ status: response.statusCode ?? 0, body: JSON.parse(responseBody) as Record<string, unknown> });
          } catch (error) {
            reject(error);
          }
        });
      });
      request.on('error', reject);
      if (payload) request.write(payload);
      request.end();
    });
  }

  function codeSentTo(email: string): string {
    const sent = capturedEmails.filter(message => message.to.some(recipient => recipient.email === email)).at(-1);
    assert.ok(sent, `expected an email to be sent to ${email}`);
    const code = sent.textContent.match(/^\d{6}$/m)?.[0];
    assert.ok(code, 'verification message must contain a six-digit code');
    return code;
  }

  function wrongCode(code: string): string {
    return code === '999999' ? '999998' : '999999';
  }

  async function register(email: string) {
    emails.add(email);
    return call('POST', '/api/auth/register', {
      firstName: 'Automated',
      lastName: 'Verification',
      email,
      dateOfBirth: '1990-01-01',
      acceptedJesus: 'No',
      password: 'TestPassword123',
    });
  }

  try {
    const email = `otp-test-${randomUUID()}@gmail.com`;
    const registration = await register(email);
    assert.equal(registration.status, 201);
    assert.match(String(registration.body.message), /check your email/i);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true, emailVerified: true, emailVerificationOtpHash: true, emailVerificationOtpExpiresAt: true },
    });
    assert.equal(user.emailVerified, false);
    assert.ok(user.emailVerificationOtpHash);
    assert.ok(user.emailVerificationOtpExpiresAt);

    const unverifiedLogin = await call('POST', '/api/auth/login', { email, password: 'TestPassword123' });
    assert.equal(unverifiedLogin.status, 403);
    const unverifiedSession = await call('GET', '/api/auth/me', undefined, signToken(user.id, 'WORSHIPER'));
    assert.equal(unverifiedSession.status, 403);

    const firstCode = codeSentTo(email);
    const invalidCode = await call('POST', '/api/auth/email-verification/verify', { email, otp: wrongCode(firstCode) });
    assert.equal(invalidCode.status, 400);
    const afterWrongCode = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { emailVerificationAttempts: true },
    });
    assert.equal(afterWrongCode.emailVerificationAttempts, 1);

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationOtpExpiresAt: new Date(Date.now() - 1000) },
    });
    const expiredCode = await call('POST', '/api/auth/email-verification/verify', { email, otp: firstCode });
    assert.equal(expiredCode.status, 400);
    assert.match(String(expiredCode.body.error), /expired/i);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationLastSentAt: new Date(Date.now() - 61_000),
        emailVerificationAttempts: 0,
      },
    });
    const resend = await call('POST', '/api/auth/email-verification/resend', { email });
    assert.equal(resend.status, 200);
    const replacementCode = codeSentTo(email);
    assert.notEqual(replacementCode, firstCode);
    const tooSoon = await call('POST', '/api/auth/email-verification/resend', { email });
    assert.equal(tooSoon.status, 429);

    for (let attempt = 0; attempt < 5; attempt++) {
      const invalid = await call('POST', '/api/auth/email-verification/verify', { email, otp: wrongCode(replacementCode) });
      assert.equal(invalid.status, 400);
    }
    const locked = await call('POST', '/api/auth/email-verification/verify', { email, otp: replacementCode });
    assert.equal(locked.status, 429);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationLastSentAt: new Date(Date.now() - 61_000),
        emailVerificationAttempts: 0,
      },
    });
    const finalResend = await call('POST', '/api/auth/email-verification/resend', { email });
    assert.equal(finalResend.status, 200);
    const finalCode = codeSentTo(email);
    const previousCode = await call('POST', '/api/auth/email-verification/verify', { email, otp: replacementCode });
    assert.equal(previousCode.status, 400);
    const verified = await call('POST', '/api/auth/email-verification/verify', { email, otp: finalCode });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.ok, true);

    const verifiedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { emailVerified: true, emailVerifiedAt: true, emailVerificationOtpHash: true },
    });
    assert.equal(verifiedUser.emailVerified, true);
    assert.ok(verifiedUser.emailVerifiedAt);
    assert.equal(verifiedUser.emailVerificationOtpHash, null);

    const reused = await call('POST', '/api/auth/email-verification/verify', { email, otp: finalCode });
    assert.equal(reused.status, 409);
    const verifiedLogin = await call('POST', '/api/auth/login', { email, password: 'TestPassword123' });
    assert.equal(verifiedLogin.status, 200);
    const session = await call('GET', '/api/auth/me', undefined, String(verifiedLogin.body.token));
    assert.equal(session.status, 200);

    const undeliveredEmail = `otp-failure-${randomUUID()}@gmail.com`;
    failNextEmail = true;
    const failedDelivery = await register(undeliveredEmail);
    assert.equal(failedDelivery.status, 502);
    assert.equal(failedDelivery.body.accountCreated, true);
    assert.equal(failedDelivery.body.code, 'EMAIL_DELIVERY_FAILED');
    const undeliveredUser = await prisma.user.findUniqueOrThrow({
      where: { email: undeliveredEmail },
      select: { emailVerified: true, emailVerificationOtpHash: true },
    });
    assert.equal(undeliveredUser.emailVerified, false);
    assert.equal(undeliveredUser.emailVerificationOtpHash, null);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    globalThis.fetch = originalFetch;
    await prisma.user.deleteMany({ where: { email: { in: [...emails] } } });
    await prisma.person.deleteMany({ where: { email: { in: [...emails] } } });
    await prisma.$disconnect();
  }
});
