import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { allowRoles, managerRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

// Public church contact details for the visitor contact page. Keep this response
// limited to information intended to be displayed publicly.
router.get('/contact', async (_req, res) => {
  const church = await prisma.church.findFirst({
    select: {
      name: true, email: true, phone: true, website: true, motto: true,
      address: { select: { country: true, region: true, city: true, subCity: true, street: true, landmark: true } },
    },
  });
  res.json({ church });
});

router.use(requireAuth);

router.get('/church', async (_req, res) => res.json({ church: await prisma.church.findFirst({ include: { address: true } }) }));

router.patch('/church', allowRoles(UserRole.ADMINISTRATOR), validateBody(z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().url().nullable().optional(),
  motto: z.string().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
})), async (req, res) => {
  const church = await prisma.church.findFirst();
  const updated = church
    ? await prisma.church.update({ where: { id: church.id }, data: req.body })
    : await prisma.church.create({ data: { name: 'Grace Evangelical Church', ...req.body } });
  res.json({ church: updated });
});

export default router;
