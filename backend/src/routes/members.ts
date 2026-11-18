import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { allowRoles, managerRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { assignMemberToAvailableHomeCell } from '../services/homeCellAssignment.js';

const router = Router();
const asParamString = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? '';
router.use(requireAuth);

router.get('/', allowRoles(...managerRoles), async (_req, res) =>
  res.json({
    members: await prisma.member.findMany({
      include: { person: true, cellMemberships: { where: { leftAt: null }, include: { cell: true } } },
      orderBy: { membershipDate: 'desc' },
    }),
  }),
);

router.post(
  '/',
  allowRoles(...managerRoles),
  validateBody(
    z.object({
      personId:         z.string(),
      membershipNumber: z.string().trim().min(2).optional(),
      membershipDate:   z.coerce.date().optional(),
    }),
  ),
  async (req, res) => {
    const person = await prisma.person.findUnique({ where: { id: String(req.body.personId) }, include: { member: true } });
    if (!person) return res.status(404).json({ error: 'Person not found.' });
    if (person.member) return res.status(409).json({ error: 'This person already has a membership record.' });
    const worshiper = await prisma.user.findFirst({ where: { personId: person.id, role: UserRole.WORSHIPER } });
    if (worshiper && !(await prisma.baptism.findFirst({ where: { personId: person.id } })))
      return res.status(422).json({ error: 'A worshiper becomes a member after a Church Manager or Administrator records an actual baptism.' });
    const member = await prisma.$transaction(async tx => {
      const created = await tx.member.create({
        data: {
          personId: person.id,
          membershipNumber: req.body.membershipNumber ?? `MEM-${randomBytes(5).toString('hex').toUpperCase()}`,
          membershipDate: req.body.membershipDate,
        },
      });
      await assignMemberToAvailableHomeCell(tx, created.id);
      await tx.user.updateMany({ where: { personId: person.id, role: UserRole.WORSHIPER }, data: { role: UserRole.MEMBER } });
      return created;
    });
    res.status(201).json({ member });
  },
);

router.delete(
  '/:id/home-cells/:cellId',
  allowRoles(...managerRoles),
  async (req, res) => {
    const memberId = asParamString(req.params.id);
    const cellId = asParamString(req.params.cellId);
    const result = await prisma.homeCellMember.updateMany({
      where: { memberId, cellId, leftAt: null },
      data: { leftAt: new Date() },
    });
    if (!result.count) return res.status(404).json({ error: 'Active Home Cell membership not found.' });
    res.json({ ok: true });
  },
);

export default router;
