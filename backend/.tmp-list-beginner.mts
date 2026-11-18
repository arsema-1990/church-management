import { prisma } from './src/prisma.ts';

const keepTitle = 'Beginner Course — Foundation of Faith';
const duplicateTitle = 'Foundations of Faith — Beginner Course';

const kept = await prisma.course.findMany({
  where: { title: keepTitle, category: 'BEGINNER' },
  select: { id: true, title: true, status: true },
});

if (kept.length !== 1) {
  throw new Error(`Expected exactly one course named "${keepTitle}"; found ${kept.length}.`);
}

const deleted = await prisma.course.deleteMany({
  where: { title: duplicateTitle, category: 'BEGINNER' },
});

console.log(JSON.stringify({ kept, deleted: deleted.count }, null, 2));
await prisma.$disconnect();
