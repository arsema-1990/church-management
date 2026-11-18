import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { allowRoles, managerRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { optionalPersonName, requiredPersonName } from '../validation/personName.js';

const router = Router();
const asParamString = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? '';
const asQueryString = (value: unknown) => {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
};
router.use(requireAuth);
router.get('/', allowRoles(...managerRoles), async (req, res) => {
  const q = asQueryString(req.query.q).trim();
  const people = await prisma.person.findMany({ where: q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : undefined, include: { member: true, user: { select: { role: true, createdAt: true } } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], take: 200 });
  res.json({ people });
});
router.post('/', allowRoles(UserRole.ADMINISTRATOR), validateBody(z.object({
  firstName: requiredPersonName, middleName: optionalPersonName.optional(), lastName: requiredPersonName, gender: z.string().optional(),
  dateOfBirth: z.coerce.date().optional(), phone: z.string().optional(), email: z.string().email().optional(), occupation: z.string().optional(), nationality: z.string().optional(), status: z.string().default('Active'),
})), async (req, res) => res.status(201).json({ person: await prisma.person.create({ data: req.body }) }));
router.get('/:id', allowRoles(...managerRoles), async (req, res) => {
  const id = asParamString(req.params.id);
  const person = await prisma.person.findUnique({ where: { id }, include: { addresses: { include: { address: true } }, member: { include: { cellMemberships: { include: { cell: true } } } }, baptisms: true, requests: { orderBy: { createdAt: 'desc' } }, certificates: true, parentLinks: { include: { child: true } } } });
  if (!person) return res.status(404).json({ error: 'Person not found.' });
  res.json({ person });
});
router.patch('/:id', allowRoles(UserRole.ADMINISTRATOR), validateBody(z.object({ firstName: requiredPersonName.optional(), middleName: optionalPersonName.nullable().optional(), lastName: requiredPersonName.optional(), phone: z.string().nullable().optional(), email: z.string().email().nullable().optional(), gender: z.string().nullable().optional(), status: z.string().optional() })), async (req, res) => {
  const id = asParamString(req.params.id);
  res.json({ person: await prisma.person.update({ where: { id }, data: req.body }) });
});
export default router;
