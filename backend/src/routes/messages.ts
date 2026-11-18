import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { allowRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { requiredPersonName } from '../validation/personName.js';

const router = Router();
const managerRoles = [UserRole.ADMINISTRATOR, UserRole.CHURCH_MANAGER];
const allMessageRoles = [...managerRoles, UserRole.CLASS_INSTRUCTOR, UserRole.WORSHIPER, UserRole.MEMBER];
const schema = z.object({
  recipientId: z.string().min(1),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(1).max(5000),
});

const publicContactSchema = z.object({
  fullName: requiredPersonName,
  email: z.string().trim().email('Enter a valid email address.').max(254),
  message: z.string().trim().min(1, 'Enter your message.').max(5000),
  website: z.string().max(0).optional(), // Honeypot field; real visitors leave it empty.
});

router.post('/contact', rateLimit({ windowMs: 15 * 60_000, limit: 8 }), validateBody(publicContactSchema), async (req, res) => {
  const { fullName, email, message } = req.body as z.infer<typeof publicContactSchema>;
  const admins = await prisma.user.findMany({
    where: { role: UserRole.ADMINISTRATOR, isActive: true },
    select: { id: true },
  });
  if (!admins.length) return res.status(503).json({ error: 'The church contact inbox is unavailable right now. Please try again later.' });

  await prisma.notification.createMany({
    data: admins.map(admin => ({
      userId: admin.id,
      senderId: null,
      category: 'message',
      title: `Website contact — ${fullName}`,
      message: `Name: ${fullName}\nEmail: ${email}\n\n${message}`,
      targetUrl: '/manager/messages',
    })),
  });
  res.status(201).json({ message: 'Your message has been sent to the church administrator.' });
});

function recipientRoles(role: UserRole): UserRole[] {
  if (role === UserRole.ADMINISTRATOR || role === UserRole.CHURCH_MANAGER)
    return [UserRole.ADMINISTRATOR, UserRole.CHURCH_MANAGER, UserRole.CLASS_INSTRUCTOR, UserRole.WORSHIPER, UserRole.MEMBER];
  if (role === UserRole.CLASS_INSTRUCTOR) return managerRoles;
  return [UserRole.ADMINISTRATOR, UserRole.CHURCH_MANAGER, UserRole.CLASS_INSTRUCTOR];
}

function inboxRoles(role: UserRole): UserRole[] {
  if (role === UserRole.ADMINISTRATOR || role === UserRole.CHURCH_MANAGER) return allMessageRoles;
  if (role === UserRole.CLASS_INSTRUCTOR) return [...managerRoles, UserRole.WORSHIPER, UserRole.MEMBER];
  return managerRoles;
}

function routerFor(base: string, roles: UserRole[]) {
  router.use(base, requireAuth, allowRoles(...roles));
  router.get(`${base}/messages/recipients`, async (req, res) => {
    const allowed = recipientRoles(req.auth!.role);
    const users = await prisma.user.findMany({
      where: { isActive: true, id: { not: req.auth!.userId }, role: { in: allowed } },
      select: { id: true, username: true, email: true, role: true, person: { select: { firstName: true, lastName: true } } },
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
    });
    res.json({ users });
  });

  router.get(`${base}/messages`, async (req, res) => {
    const usersAllowed = inboxRoles(req.auth!.role);
    const notifications = await prisma.notification.findMany({
      where: {
        category: 'message',
        OR: [
          { userId: req.auth!.userId },
          { senderId: req.auth!.userId, user: { role: { in: usersAllowed } } },
        ],
      },
      include: {
        sender: { select: { id: true, username: true, role: true, person: { select: { firstName: true, lastName: true } } } },
        user: { select: { id: true, username: true, role: true, person: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const messages = notifications.map(n => ({
      id: n.id, title: n.title, message: n.message, createdAt: n.createdAt, readAt: n.readAt,
      direction: n.userId === req.auth!.userId ? 'received' : 'sent',
      senderId: n.senderId,
      senderName: n.sender?.person ? `${n.sender.person.firstName} ${n.sender.person.lastName}` : n.sender?.username ?? 'Church staff',
      senderRole: n.sender?.role,
      recipientId: n.userId,
      recipientName: n.user.person ? `${n.user.person.firstName} ${n.user.person.lastName}` : n.user.username,
    }));
    res.json({ messages });
  });

  router.post(`${base}/messages`, validateBody(schema), async (req, res) => {
    const { recipientId, subject, message } = req.body as z.infer<typeof schema>;
    if (recipientId === req.auth!.userId) return res.status(422).json({ error: 'Choose another person as the recipient.' });
    const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true, role: true, isActive: true } });
    if (!recipient?.isActive) return res.status(404).json({ error: 'The selected recipient is unavailable.' });
    if (!recipientRoles(req.auth!.role).includes(recipient.role)) return res.status(403).json({ error: 'You cannot message this role.' });
    const sender = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { username: true, role: true } });
    const notification = await prisma.notification.create({
      data: {
        userId: recipient.id,
        senderId: req.auth!.userId,
        category: 'message',
        title: subject,
        message,
        targetUrl: '/messages',
      },
    });
    res.status(201).json({ message: notification, sentTo: recipient.id, sender: sender?.username });
  });

  router.patch(`${base}/messages/:id/read`, async (req, res) => {
    const updated = await prisma.notification.updateMany({
      where: { id: String(req.params.id), userId: req.auth!.userId, category: 'message' },
      data: { readAt: new Date() },
    });
    if (!updated.count) return res.status(404).json({ error: 'Message not found.' });
    res.json({ ok: true });
  });
}

routerFor('/manager', managerRoles);
routerFor('/instructor', [UserRole.CLASS_INSTRUCTOR]);
routerFor('/portal', [UserRole.WORSHIPER, UserRole.MEMBER]);

export default router;
