/**
 * Creates a Church Manager account and an optional Class Instructor account.
 * Run once after the main seed:
 *   npx tsx prisma/seed-manager.ts
 *
 * Required .env variables:
 *   MANAGER_EMAIL, MANAGER_USERNAME, MANAGER_PASSWORD  (min 12 chars)
 *
 * Optional:
 *   INSTRUCTOR_EMAIL, INSTRUCTOR_USERNAME, INSTRUCTOR_PASSWORD
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from '../src/prisma.js';

async function createAccount(
  email: string,
  username: string,
  password: string,
  role: 'CHURCH_MANAGER' | 'CLASS_INSTRUCTOR',
  firstName: string,
  lastName: string,
) {
  const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
  if (existing) {
    console.log(`⚠  Account already exists for ${email} — skipping.`);
    return;
  }
  if (password.length < 12) throw new Error(`Password for ${email} must be at least 12 characters.`);

  await prisma.$transaction(async tx => {
    const person = await tx.person.create({
      data: { firstName, lastName, email },
    });
    await tx.user.create({
      data: { email, username, passwordHash: await bcrypt.hash(password, 12), role, personId: person.id },
    });
  });
  console.log(`✓  Created ${role} account: ${email}`);
}

async function main() {
  // ── Church Manager ────────────────────────────────────────────────
  const mgEmail    = process.env.MANAGER_EMAIL?.trim().toLowerCase();
  const mgUsername = process.env.MANAGER_USERNAME?.trim();
  const mgPassword = process.env.MANAGER_PASSWORD;

  if (mgEmail && mgUsername && mgPassword) {
    await createAccount(mgEmail, mgUsername, mgPassword, 'CHURCH_MANAGER', 'Church', 'Manager');
  } else {
    console.log('ℹ  MANAGER_EMAIL / MANAGER_USERNAME / MANAGER_PASSWORD not set — skipping manager.');
  }

  // ── Class Instructor (optional) ───────────────────────────────────
  const inEmail    = process.env.INSTRUCTOR_EMAIL?.trim().toLowerCase();
  const inUsername = process.env.INSTRUCTOR_USERNAME?.trim();
  const inPassword = process.env.INSTRUCTOR_PASSWORD;

  if (inEmail && inUsername && inPassword) {
    await createAccount(inEmail, inUsername, inPassword, 'CLASS_INSTRUCTOR', 'Class', 'Instructor');
  }

}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
