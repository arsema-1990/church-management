import { Router } from 'express';
import { z } from 'zod';
import { RequestType, RequestStatus, UserRole } from '@prisma/client';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { uploadProfilePhoto } from '../middleware/profilePhoto.js';
import { optionalPersonName, requiredPersonName } from '../validation/personName.js';

const router = Router();

// ── Public: certificate verification ─────────────────────────────────────────
router.get('/verify/:code', async (req, res) => {
  const certificate = await prisma.certificate.findUnique({
    where: { verificationCode: String(req.params.code) },
    include: { person: true },
  });
  if (!certificate) return res.status(404).json({ valid: false, error: 'Certificate not found.' });
  res.json({
    valid: true,
    certificate: {
      certificateNumber: certificate.certificateNumber,
      type: certificate.type,
      courseTitleSnapshot: certificate.courseTitleSnapshot,
      issuedAt: certificate.issuedAt,
      recipient: `${certificate.person.firstName} ${certificate.person.lastName}`,
      issuer: certificate.issuerNameSnapshot,
    },
  });
});

router.use(requireAuth);

async function accountPerson(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!user?.personId)
    throw Object.assign(new Error('The account has no linked church person profile.'), { status: 422 });
  return user.personId;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.auth!.userId },
    include: {
      person: {
        include: {
          member: {
            include: {
              cellMemberships: {
                where: { leftAt: null },
                include: {
                  cell: {
                    include: {
                      leader: true,
                      activities: { orderBy: { scheduledAt: 'desc' }, take: 5 },
                    },
                  },
                },
              },
            },
          },
          parentLinks: { include: { child: true } },
          requests: { orderBy: { createdAt: 'desc' } },
          certificates: { orderBy: { issuedAt: 'desc' } },
          baptisms: { orderBy: { baptizedAt: 'desc' }, take: 1 },
          courseProgress: {
            include: { course: { select: { id: true, title: true, category: true, status: true, lessons: true } } },
            orderBy: { updatedAt: 'desc' },
          },
        },
      },
    },
  });

  const pendingRequests = user.person
    ? await prisma.portalRequest.count({
        where: { personId: user.person.id, status: RequestStatus.PENDING },
      })
    : 0;

  const notifications = await prisma.notification.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const unreadCount = notifications.filter(n => !n.readAt).length;

  res.json({
    user: { id: user.id, role: user.role, username: user.username, email: user.email },
    person: user.person,
    stats: {
      pendingRequests,
      courses: user.person?.courseProgress.length ?? 0,
      certificates: user.person?.certificates.length ?? 0,
      unreadNotifications: unreadCount,
    },
    progress: user.person?.courseProgress ?? [],
    notifications: notifications.slice(0, 5),
  });
});

// ── Profile ───────────────────────────────────────────────────────────────────
const profileSchema = z.object({
  firstName:            requiredPersonName.optional(),
  middleName:           optionalPersonName.nullable().optional(),
  lastName:             requiredPersonName.optional(),
  phone:                z.string().trim().max(40).regex(/^\+?[\d\s().-]{7,40}$/,'Enter a valid phone number.').or(z.literal('')).nullable().optional(),
  officeTelephone:      z.string().trim().max(40).regex(/^\+?[\d\s().-]{7,40}$/,'Enter a valid phone number.').or(z.literal('')).nullable().optional(),
  homeTelephone:        z.string().trim().max(40).regex(/^\+?[\d\s().-]{7,40}$/,'Enter a valid phone number.').or(z.literal('')).nullable().optional(),
  gender:               z.string().max(30).nullable().optional(),
  dateOfBirth:          z.coerce.date().nullable().optional(),
  placeOfBirth:         z.string().max(100).nullable().optional(),
  maritalStatus:        z.string().max(40).nullable().optional(),
  nationality:          z.string().max(80).nullable().optional(),
  acceptedJesus:        z.string().max(5).nullable().optional(),
  denomination:         z.string().max(30).nullable().optional(),
  memberOfThisChurch:    z.string().max(5).nullable().optional(),
  educationalLevel:     z.string().max(100).nullable().optional(),
  occupation:           z.string().max(100).nullable().optional(),
  makingALiving:        z.string().max(100).nullable().optional(),
  // Spiritual journey
  yearReceivedLord:     z.string().max(10).refine(value => !value || (/^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= new Date().getFullYear()),'Enter a valid year.').nullable().optional(),
  yearBaptized:         z.string().max(10).refine(value => !value || (/^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= new Date().getFullYear()),'Enter a valid year.').nullable().optional(),
  membershipYears:      z.string().max(10).nullable().optional(),
  previousChurch:       z.string().max(5).nullable().optional(),
  previousChurchName:   z.string().max(200).nullable().optional(),
  // Home association
  sharesHomeAssociation: z.string().max(5).nullable().optional(),
  homeAssociationReason: z.string().max(300).nullable().optional(),
  sharesWhoseHouse:      optionalPersonName.nullable().optional(),
  unionLeaderName:       optionalPersonName.nullable().optional(),
  // Service
  currentService:       z.string().max(1000).nullable().optional(),
  pastService:          z.string().max(1000).nullable().optional(),
  serviceLoad:          z.string().max(1000).nullable().optional(),
  // Family (married section)
  familySize:           z.string().max(10).nullable().optional(),
  numberOfChildren:     z.string().max(10).nullable().optional(),
  childrenKnowLord:     z.string().max(10).nullable().optional(),
  poorNotKnowLord:      z.string().max(10).nullable().optional(),
  unemployedInHousehold: z.string().max(10).nullable().optional(),
  registrationMonth:    z.string().max(30).nullable().optional(),
});

router.post('/profile/photo', uploadProfilePhoto.single('photo'), async (req, res) => {
  if (!req.file) return res.status(422).json({ error: 'Choose a profile photo to upload.' });
  const personId = await accountPerson(req.auth!.userId);
  const person = await prisma.person.update({ where: { id: personId }, data: { photoUrl: `/uploads/profiles/${req.file.filename}` } });
  return res.status(201).json({ person });
});

router.patch('/profile', validateBody(profileSchema), async (req, res) => {
  const personId = await accountPerson(req.auth!.userId);
  res.json({ person: await prisma.person.update({ where: { id: personId }, data: req.body }) });
});

// ── Children ──────────────────────────────────────────────────────────────────
router.get('/children', async (req, res) => {
  const personId = await accountPerson(req.auth!.userId);
  res.json({
    children: await prisma.childParent.findMany({ where: { personId }, include: { child: true } }),
  });
});

router.post(
  '/children',
  validateBody(
    z.object({
      firstName:   requiredPersonName,
      middleName:  optionalPersonName.optional(),
      lastName:    optionalPersonName.optional(),
      dateOfBirth: z.coerce.date().max(new Date(), 'Date of birth cannot be in the future').optional(),
      gender:      z.string().max(30).optional(),
      grade:       z.string().max(100).optional(),
    }),
  ),
  async (req, res) => {
    const personId = await accountPerson(req.auth!.userId);
    const child = await prisma.child.create({
      data: { ...req.body, parentLinks: { create: { personId } } },
    });
    res.status(201).json({ child });
  },
);

// ── Home Cell ─────────────────────────────────────────────────────────────────
router.get('/home-cell', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.auth!.userId },
    select: {
      person: {
        select: {
          member: {
            select: {
              cellMemberships: {
                where: { leftAt: null },
                include: {
                  cell: {
                    include: {
                      leader: true,
                      members: {
                        where: { leftAt: null },
                        include: { member: { include: { person: true } } },
                      },
                      activities: { orderBy: { scheduledAt: 'desc' }, take: 10 },
                      attendance: { orderBy: { attendedAt: 'desc' }, take: 20 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!user.person?.member)
    return res.status(403).json({ error: 'Home Cell access becomes available after membership.' });
  res.json({ homeCells: user.person.member.cellMemberships.map(link => link.cell) });
});

// ── Requests ──────────────────────────────────────────────────────────────────
router.get('/requests', async (req, res) => {
  const personId = await accountPerson(req.auth!.userId);
  res.json({
    requests: await prisma.portalRequest.findMany({
      where: { personId },
      include: {
        certificate: true,
        reviewer: { select: { username: true, person: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  });
});

router.post(
  '/requests',
  validateBody(
    z.object({
      type:          z.enum([RequestType.BAPTISM]),
      details:       z.string().trim().max(3000).optional(),
      requestedDate: z.coerce.date().optional(),
    }),
  ),
  async (req, res) => {
    const personId = await accountPerson(req.auth!.userId);
    const { type, details, requestedDate } = req.body as {
      type: RequestType;
      details?: string;
      requestedDate?: Date;
    };

    if (requestedDate && requestedDate < new Date(new Date().toDateString()))
      return res.status(422).json({ error: 'Choose a date today or later.' });

    if (type === RequestType.BAPTISM) {
      const courseCertificate = await prisma.certificate.findFirst({
        where: { personId, type: 'COURSE' },
      });
      if (!courseCertificate)
        return res.status(422).json({
          error: 'A manager-approved course certificate is required before baptism can be requested.',
        });
    }

    const open = await prisma.portalRequest.findFirst({
      where: { personId, type, status: { in: [RequestStatus.PENDING, RequestStatus.APPROVED] } },
    });
    if (open)
      return res.status(409).json({ error: 'You already have an active request of this type.' });

    const request = await prisma.portalRequest.create({
      data: { personId, type, details, requestedDate },
    });
    res.status(201).json({ request });
  },
);

// ── Certificates ──────────────────────────────────────────────────────────────
router.get('/certificates', async (req, res) => {
  const personId = await accountPerson(req.auth!.userId);
  res.json({
    certificates: await prisma.certificate.findMany({
      where: { personId },
      include: { person: true, issuer: { select: { username: true, person: true } } },
      orderBy: { issuedAt: 'desc' },
    }),
  });
});

// ── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications', async (req, res) =>
  res.json({
    notifications: await prisma.notification.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  }),
);

router.patch('/notifications/:id/read', async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] ?? '' : req.params.id ?? '';
  const updated = await prisma.notification.updateMany({
    where: { id, userId: req.auth!.userId },
    data: { readAt: new Date() },
  });
  if (!updated.count) return res.status(404).json({ error: 'Notification not found.' });
  res.json({ ok: true });
});

router.post('/notifications/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.auth!.userId, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});

export default router;
