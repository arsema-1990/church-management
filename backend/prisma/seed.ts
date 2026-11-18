import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from '../src/prisma.js';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !username || !password || password.length < 12) throw new Error('Set ADMIN_EMAIL, ADMIN_USERNAME, and an ADMIN_PASSWORD with at least 12 characters before seeding.');
  const hash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('An account already uses ADMIN_EMAIL; the seed will not overwrite existing credentials.');
  await prisma.user.create({ data: { email, username, passwordHash: hash, role: 'ADMINISTRATOR' } });
  if (!await prisma.church.findFirst()) await prisma.church.create({ data: { name: 'Grace Evangelical Church', motto: 'Together in faith · Grow · Serve' } });
  console.log(`Created the initial administrator account for ${email}.`);
}

main().finally(async () => prisma.$disconnect());
