import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { CourseCategory, MaterialType, RequestStatus, RequestType, ReviewStatus, UserRole } from '@prisma/client';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { allowRoles, managerRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { issueCertificate } from '../services/certificates.js';
import { optionalPersonName, requiredPersonName } from '../validation/personName.js';
import { assignMemberToAvailableHomeCell, assignUnassignedMembers } from '../services/homeCellAssignment.js';

const router = Router();
const asParamString = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? '';
const courseMaterialUpload = multer({
  storage: multer.diskStorage({
    destination: path.resolve('uploads'),
    filename: (_req, file, done) => done(null, `${Date.now()}-${randomBytes(12).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, done) => {
    const allowed = new Set(['video/mp4','video/webm','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','image/webp','audio/mpeg','audio/ogg','audio/wav','text/plain','application/zip']);
    done(allowed.has(file.mimetype) ? null : (new Error('Unsupported course material type.') as unknown as null), allowed.has(file.mimetype));
  },
});
router.use(requireAuth);
router.use(allowRoles(...managerRoles));

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', async (_req, res) => {
  const [
    worshipers, members, homeCells, courses, classes,
    certificates, baptisms, courseApprovals, materialApprovals,
    recentWorshipers, recentRequests,
  ] = await Promise.all([
    prisma.user.count({ where: { role: UserRole.WORSHIPER } }),
    prisma.member.count(),
    prisma.homeCell.count(),
    prisma.course.count({ where: { status: { not: ReviewStatus.ARCHIVED } } }),
    prisma.churchClass.count(),
    prisma.certificate.count(),
    prisma.portalRequest.count({ where: { type: RequestType.BAPTISM, status: RequestStatus.PENDING } }),
    prisma.course.count({ where: { status: ReviewStatus.PENDING_APPROVAL } }),
    prisma.courseMaterial.count({ where: { status: ReviewStatus.PENDING_APPROVAL } }),
    // Recent activity: last 5 worshiper registrations
    prisma.user.findMany({
      where: { role: { in: [UserRole.WORSHIPER, UserRole.MEMBER] } },
      select: { id: true, role: true, createdAt: true, person: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    // Recent requests
    prisma.portalRequest.findMany({
      where: { status: RequestStatus.PENDING, type: RequestType.BAPTISM },
      include: { person: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const recentActivity = [
    ...recentWorshipers.map(u => ({
      id: u.id,
      type: 'registration',
      message: `${u.role === UserRole.MEMBER ? 'New member registered' : 'New worshiper registered'}: ${u.person?.firstName ?? ''} ${u.person?.lastName ?? ''}`,
      createdAt: u.createdAt,
    })),
    ...recentRequests.map(r => ({
      id: r.id,
      type: r.type.toLowerCase(),
      message: `${r.type.replace('_', ' ')} request submitted by ${r.person.firstName} ${r.person.lastName}`,
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);

  res.json({
    stats: {
      worshipers, members, homeCells, courses, classes,
      certificates, baptisms,
      classCourseApprovals: courseApprovals + materialApprovals,
    },
    recentActivity,
  });
});

// ── Profile ───────────────────────────────────────────────────────────────────
router.get('/profile', async (req, res) =>
  res.json({
    user: await prisma.user.findUniqueOrThrow({
      where: { id: req.auth!.userId },
      select: { id: true, username: true, email: true, role: true, signatureData: true, person: true },
    }),
  }),
);

router.patch(
  '/profile',
  validateBody(
    z.object({
      firstName:    requiredPersonName.optional(),
      middleName:   optionalPersonName.nullable().optional(),
      lastName:     requiredPersonName.optional(),
      signatureData: z.string().max(100_000).nullable().optional(),
      phone:         z.string().trim().max(40).refine(value => !value || /^\+?[\d\s().-]{7,20}$/.test(value), 'Enter a valid phone number.').nullable().optional(),
      occupation:    z.string().trim().max(100).nullable().optional(),
    }),
  ),
  async (req, res) => {
    if (req.body.phone !== undefined && req.auth!.role !== UserRole.ADMINISTRATOR)
      return res.status(403).json({ error: 'Contact details can only be changed by an Administrator.' });

    const { signatureData, firstName, middleName, lastName, phone, occupation } = req.body;
    const user = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { signatureData },
    });
    if (user.personId && (firstName !== undefined || middleName !== undefined || lastName !== undefined || phone !== undefined || occupation !== undefined)) {
      await prisma.person.update({ where: { id: user.personId }, data: { firstName, middleName, lastName, phone, occupation } });
    }
    res.json({
      user: await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { id: true, email: true, role: true, signatureData: true, person: true },
      }),
    });
  },
);

// ── Worshipers ────────────────────────────────────────────────────────────────
router.get('/worshipers', async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: UserRole.WORSHIPER },
    include: {
      person: {
        include: {
          courseProgress: { include: { course: { select: { title: true, category: true } } } },
          requests: { orderBy: { createdAt: 'desc' } },
          certificates: true,
          baptisms: true,
          member: { include: { cellMemberships: { where: { leftAt: null }, include: { cell: true } } } },
          addresses: { include: { address: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  res.json({ worshipers: users });
});

router.patch(
  '/worshipers/:id/status',
  validateBody(z.object({ isActive: z.boolean() })),
  async (req, res) => {
    const id = asParamString(req.params.id);
    const user = await prisma.user.findFirst({ where: { id, role: UserRole.WORSHIPER } });
    if (!user) return res.status(404).json({ error: 'Worshiper account not found.' });
    const updated = await prisma.user.update({ where: { id }, data: { isActive: req.body.isActive } });
    await prisma.auditEvent.create({
      data: {
        actorId: req.auth!.userId,
        action: 'EDIT_ACCOUNT',
        entity: 'User',
        entityId: id,
        metadata: { changes: [req.body.isActive ? 'Activated account' : 'Deactivated account'], email: user.email },
      },
    });
    res.json({ user: updated });
  },
);

router.delete('/worshipers/:id', async (req, res) => {
  const id = asParamString(req.params.id);
  const user = await prisma.user.findFirst({
    where: { id, role: UserRole.WORSHIPER },
    select: { id: true, email: true, personId: true },
  });
  if (!user) return res.status(404).json({ error: 'Worshiper account not found.' });

  await prisma.$transaction(async tx => {
    if (user.personId) await tx.person.delete({ where: { id: user.personId } });
    await tx.user.delete({ where: { id: user.id } });
    await tx.auditEvent.create({
      data: {
        actorId: req.auth!.userId,
        action: 'DELETE_ACCOUNT',
        entity: 'User',
        entityId: user.id,
        metadata: { email: user.email },
      },
    });
  });
  res.json({ message: 'Worshiper account and linked profile deleted.' });
});

// Single worshiper journey
router.get('/worshipers/:id', async (req, res) => {
  const id = asParamString(req.params.id);
  const user = await prisma.user.findFirst({
    where: { id, role: { in: [UserRole.WORSHIPER, UserRole.MEMBER] } },
    include: {
      person: {
        include: {
          courseProgress: { include: { course: true } },
          requests: { orderBy: { createdAt: 'desc' } },
          certificates: true,
          baptisms: true,
          member: { include: { cellMemberships: { include: { cell: true } } } },
          parentLinks: { include: { child: true } },
        },
      },
    },
  });
  if (!user) return res.status(404).json({ error: 'Worshiper not found.' });
  res.json({ user });
});

// ── Members ───────────────────────────────────────────────────────────────────
router.get('/members', async (_req, res) =>
  res.json({
    members: await prisma.member.findMany({
      include: {
        person: {
          include: {
            user: { select: { id: true, username: true, email: true, isActive: true, role: true } },
            baptisms: true,
            certificates: true,
            addresses: { include: { address: true } },
          },
        },
        cellMemberships: { where: { leftAt: null }, include: { cell: true } },
      },
      orderBy: { membershipDate: 'desc' },
      take: 500,
    }),
  }),
);

router.patch(
  '/members/:id/status',
  validateBody(z.object({ status: z.enum(['Active', 'Inactive']) })),
  async (req, res) => {
    const id = asParamString(req.params.id);
    const member = await prisma.member.findUnique({ where: { id }, include: { person: { include: { user: true } } } });
    if (!member) return res.status(404).json({ error: 'Member not found.' });
    const isActive = req.body.status === 'Active';
    await prisma.$transaction(async tx => {
      await tx.member.update({ where: { id }, data: { status: req.body.status } });
      if (member.person.user) await tx.user.update({ where: { id: member.person.user.id }, data: { isActive } });
      await tx.auditEvent.create({
        data: {
          actorId: req.auth!.userId,
          action: 'EDIT_ACCOUNT',
          entity: 'Member',
          entityId: id,
          metadata: { changes: [isActive ? 'Activated member account' : 'Deactivated member account'] },
        },
      });
    });
    res.json({ ok: true, status: req.body.status });
  },
);

router.post(
  '/members/:id/home-cell',
  validateBody(z.object({ cellId: z.string().nullable().optional() })),
  async (req, res) => {
    const memberId = asParamString(req.params.id);
    const { cellId } = req.body;
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) return res.status(404).json({ error: 'Member not found.' });

    await prisma.$transaction(async tx => {
      await tx.homeCellMember.updateMany({
        where: { memberId, leftAt: null },
        data: { leftAt: new Date() },
      });
      if (cellId) {
        const cell = await tx.homeCell.findUnique({ where: { id: cellId } });
        if (!cell) throw new Error('Home Cell not found.');
        await tx.homeCellMember.create({ data: { cellId, memberId } });
      }
    });

    res.json({ ok: true, message: cellId ? 'Member assigned to home cell.' : 'Member removed from home cell.' });
  },
);

router.post('/members/auto-assign-cells', async (_req, res) => {
  const count = await prisma.$transaction(async tx => assignUnassignedMembers(tx));
  res.json({ ok: true, assigned: count });
});

router.delete('/members/:id', async (req, res) => {
  const id = asParamString(req.params.id);
  const member = await prisma.member.findUnique({ where: { id }, include: { person: { include: { user: true } } } });
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  await prisma.$transaction(async tx => {
    await tx.member.delete({ where: { id } });
    if (member.person.user) await tx.user.update({ where: { id: member.person.user.id }, data: { role: UserRole.WORSHIPER } });
    await tx.auditEvent.create({
      data: {
        actorId: req.auth!.userId,
        action: 'REMOVE_MEMBERSHIP',
        entity: 'Member',
        entityId: id,
        metadata: { personId: member.personId, email: member.person.user?.email },
      },
    });
  });
  res.json({ message: 'Membership removed; the person account and church history were preserved.' });
});

// ── Certificates ──────────────────────────────────────────────────────────────
router.get('/certificates', async (_req, res) =>
  res.json({
    certificates: await prisma.certificate.findMany({
      include: { person: true, issuer: { select: { username: true, person: true } } },
      orderBy: { issuedAt: 'desc' },
      take: 500,
    }),
  }),
);

// ── Home Cells ────────────────────────────────────────────────────────────────
router.get('/home-cells', async (_req, res) => {
  const homeCells = await prisma.homeCell.findMany({
    include: {
      leader: true,
      members: {
        where: { leftAt: null },
        include: { member: { include: { person: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });
  res.json({
    homeCells: homeCells.map(cell => ({
      ...cell,
      memberCount: cell.members.length,
      availableCapacity: Math.max(0, cell.capacity - cell.members.length),
    })),
  });
});

router.post(
  '/home-cells',
  validateBody(
    z.object({
      name:        z.string().trim().min(2).max(120),
      location:    z.string().trim().max(200).optional(),
      capacity:    z.number().int().positive().max(500).default(20),
      leaderId:    z.string().optional(),
    }),
  ),
  async (req, res) => {
    const homeCell = await prisma.$transaction(async tx => {
      const created = await tx.homeCell.create({ data: req.body });
      await assignUnassignedMembers(tx);
      return created;
    });
    res.status(201).json({ homeCell });
  },
);

router.get('/home-cells/:id', async (req, res) => {
  const id = asParamString(req.params.id);
  const homeCell = await prisma.homeCell.findUnique({
    where: { id },
    include: {
      leader: true,
      members: {
        where: { leftAt: null },
        include: { member: { include: { person: true } } },
      },
      attendance: { include: { person: true }, orderBy: { attendedAt: 'desc' }, take: 100 },
      activities: { orderBy: { scheduledAt: 'desc' } },
    },
  });
  if (!homeCell) return res.status(404).json({ error: 'Home Cell not found.' });
  res.json({ homeCell });
});

router.patch(
  '/home-cells/:id',
  validateBody(
    z.object({
      name:        z.string().trim().min(2).max(120).optional(),
      location:    z.string().trim().max(200).nullable().optional(),
      capacity:    z.number().int().min(1).max(500).optional(),
      leaderId:    z.string().nullable().optional(),
      isActive:    z.boolean().optional(),
    }),
  ),
  async (req, res) => {
    const id = asParamString(req.params.id);
    const cell = await prisma.homeCell.findUnique({ where: { id } });
    if (!cell) return res.status(404).json({ error: 'Home Cell not found.' });
    res.json({ homeCell: await prisma.homeCell.update({ where: { id: cell.id }, data: req.body }) });
  },
);

router.post(
  '/home-cells/:id/attendance',
  validateBody(
    z.object({
      personIds: z.array(z.string()).min(1).max(200),
      attendedAt: z.coerce.date().optional(),
      note: z.string().max(1000).optional(),
    }),
  ),
  async (req, res) => {
    const id = asParamString(req.params.id);
    const cell = await prisma.homeCell.findUnique({ where: { id } });
    if (!cell) return res.status(404).json({ error: 'Home Cell not found.' });
    const records = await prisma.homeCellAttendance.createMany({
      data: (req.body.personIds as string[]).map(personId => ({
        cellId: cell.id,
        personId,
        attendedAt: req.body.attendedAt,
        note: req.body.note,
      })),
    });
    res.status(201).json({ recorded: records.count });
  },
);

router.post(
  '/home-cells/:id/activities',
  validateBody(
    z.object({
      type:        z.enum(['BIBLE_STUDY', 'PRAYER', 'ANNOUNCEMENT', 'OTHER']),
      title:       z.string().trim().min(2).max(120),
      description: z.string().max(3000).optional(),
      scheduledAt: z.coerce.date().optional(),
    }),
  ),
  async (req, res) => {
    const id = asParamString(req.params.id);
    const cell = await prisma.homeCell.findUnique({ where: { id } });
    if (!cell) return res.status(404).json({ error: 'Home Cell not found.' });
    res.status(201).json({
      activity: await prisma.homeCellActivity.create({ data: { ...req.body, cellId: cell.id } }),
    });
  },
);

// ── Classes ───────────────────────────────────────────────────────────────────
router.get('/classes', async (_req, res) =>
  res.json({
    classes: await prisma.churchClass.findMany({
      include: {
        instructors: { include: { user: { select: { id: true, username: true, email: true, person: true } } } },
        courseLinks: { include: { course: true } },
      },
      orderBy: { name: 'asc' },
    }),
  }),
);

router.post(
  '/classes',
  validateBody(z.object({ name: z.string().trim().min(2), description: z.string().max(3000).optional(), status: z.string().default('Active') })),
  async (req, res) =>
    res.status(201).json({ churchClass: await prisma.churchClass.create({ data: req.body }) }),
);

router.post(
  '/classes/:id/instructors',
  validateBody(z.object({ userId: z.string() })),
  async (req, res) => {
    const id = asParamString(req.params.id);
    const [instructor, churchClass] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.body.userId } }),
      prisma.churchClass.findUnique({ where: { id } }),
    ]);
    if (!churchClass) return res.status(404).json({ error: 'Class not found.' });
    if (!instructor || instructor.role !== UserRole.CLASS_INSTRUCTOR)
      return res.status(422).json({ error: 'Choose an active Class/Course Instructor account.' });
    res.status(201).json({
      assignment: await prisma.classInstructor.upsert({
        where: { classId_userId: { classId: churchClass.id, userId: instructor.id } },
        create: { classId: churchClass.id, userId: instructor.id },
        update: {},
      }),
    });
  },
);

router.post(
  '/classes/:id/courses',
  validateBody(z.object({ courseId: z.string() })),
  async (req, res) => {
    const [course, churchClass] = await Promise.all([
      prisma.course.findUnique({ where: { id: req.body.courseId } }),
      prisma.churchClass.findUnique({ where: { id: String(String(req.params.id)) } }),
    ]);
    if (!course || !churchClass) return res.status(404).json({ error: 'Course or class not found.' });
    res.status(201).json({
      link: await prisma.courseClass.upsert({
        where: { courseId_classId: { courseId: course.id, classId: churchClass.id } },
        create: { courseId: course.id, classId: churchClass.id },
        update: {},
      }),
    });
  },
);

// ── Courses & Materials ───────────────────────────────────────────────────────
router.post('/courses', allowRoles(UserRole.CHURCH_MANAGER), validateBody(z.object({
  title: z.string().trim().min(2).max(160),
  category: z.nativeEnum(CourseCategory).default(CourseCategory.NORMAL_DAY_TO_DAY),
  description: z.string().trim().max(8000).optional(),
  duration: z.string().trim().max(100).optional(),
  objectives: z.string().trim().max(4000).optional(),
  lessons: z.array(z.string().trim().min(1)).max(100).default([]),
  startDate: z.coerce.date().optional(),
})), async (req, res) => {
  const data = req.body;
  const now = new Date();
  const course = await prisma.course.create({ data: {
    ...data,
    targetAudience: 'MEMBERS',
    status: ReviewStatus.PUBLISHED,
    instructorId: req.auth!.userId,
    reviewerId: req.auth!.userId,
    reviewedAt: now,
    publishedAt: now,
  } });
  res.status(201).json({ course });
});

router.post('/courses/:id/materials', allowRoles(UserRole.CHURCH_MANAGER), courseMaterialUpload.single('file'), async (req, res) => {
  const id = asParamString(req.params.id);
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course || course.status !== ReviewStatus.PUBLISHED || course.targetAudience !== 'MEMBERS') {
    return res.status(404).json({ error: 'Published member course not found.' });
  }
  const parsed = z.object({
    title: z.string().trim().min(2).max(160),
    type: z.nativeEnum(MaterialType),
    lessonNumber: z.string().optional(),
    onlineUrl: z.string().trim().max(2048).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message ?? 'Check the material details.' });
  const { title, type, onlineUrl } = parsed.data;
  if (!req.file && !onlineUrl) return res.status(422).json({ error: 'Choose a file or enter a YouTube/resource URL.' });
  if (onlineUrl) {
    try {
      if (!['http:', 'https:'].includes(new URL(onlineUrl).protocol)) throw new Error();
    } catch { return res.status(422).json({ error: 'Enter a valid http or https resource URL.' }); }
  }
  const lessonNumber = parsed.data.lessonNumber ? Number(parsed.data.lessonNumber) : null;
  if (lessonNumber !== null && (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > 100)) {
    return res.status(422).json({ error: 'Lesson number must be from 1 to 100.' });
  }
  const now = new Date();
  const material = await prisma.courseMaterial.create({ data: {
    courseId: course.id,
    instructorId: req.auth!.userId,
    reviewerId: req.auth!.userId,
    title,
    type,
    lessonNumber,
    fileUrl: req.file ? `/uploads/${req.file.filename}` : null,
    onlineUrl: onlineUrl || null,
    status: ReviewStatus.PUBLISHED,
    reviewedAt: now,
  } });
  res.status(201).json({ material });
});

router.get('/courses', async (_req, res) => {
  const courses = await prisma.course.findMany({
    include: {
      instructor: { select: { username: true, person: true } },
      reviewer:   { select: { username: true } },
      materials:  true,
      enrollments: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ courses });
});

router.post(
  '/courses/:id/review',
  allowRoles(UserRole.CHURCH_MANAGER),
  validateBody(z.object({ decision: z.enum(['approve', 'reject']), notes: z.string().trim().max(3000).optional() })),
  async (req, res) => {
    const course = await prisma.course.findUnique({ where: { id: String(String(req.params.id)) } });
    if (!course || course.status !== ReviewStatus.PENDING_APPROVAL)
      return res.status(404).json({ error: 'A pending course was not found.' });
    const { decision, notes } = req.body as { decision: 'approve' | 'reject'; notes?: string };
    if (decision === 'reject' && !notes)
      return res.status(422).json({ error: 'Add a rejection reason for the instructor.' });
    const status = decision === 'approve' ? ReviewStatus.PUBLISHED : ReviewStatus.REJECTED;
    const [updated] = await prisma.$transaction([
      prisma.course.update({
        where: { id: course.id },
        data: {
          status,
          rejectionReason: decision === 'reject' ? notes : null,
          reviewerId: req.auth!.userId,
          reviewedAt: new Date(),
          publishedAt: decision === 'approve' ? new Date() : null,
        },
      }),
      prisma.courseMaterial.updateMany({
        where: { courseId: course.id, status: ReviewStatus.PENDING_APPROVAL },
        data: {
          status,
          rejectionReason: decision === 'reject' ? notes : null,
          reviewerId: req.auth!.userId,
          reviewedAt: new Date(),
        },
      }),
    ]);
    if (decision === 'approve')
      await notifyEligibleLearners(course.category, course.targetAudience, course.title, course.minAge, course.maxAge);
    await prisma.notification.create({
      data: {
        userId:    course.instructorId,
        category: 'course',
        title:    decision === 'approve' ? 'Course approved and published' : 'Course needs changes',
        message:  decision === 'approve'
          ? `${course.title} is now available to eligible learners.`
          : `Course feedback: ${notes}`,
        targetUrl: '/instructor/courses',
      },
    });
    res.json({ course: updated });
  },
);

router.post(
  '/materials/:id/review',
  allowRoles(UserRole.CHURCH_MANAGER),
  validateBody(z.object({ decision: z.enum(['approve', 'reject']), notes: z.string().trim().max(3000).optional() })),
  async (req, res) => {
    const material = await prisma.courseMaterial.findUnique({
      where: { id: String(String(req.params.id)) },
      include: { course: true },
    });
    if (!material || material.status !== ReviewStatus.PENDING_APPROVAL || (material as any).course?.status !== ReviewStatus.PUBLISHED)
      return res.status(404).json({ error: 'A pending material for a published course was not found.' });
    const { decision, notes } = req.body as { decision: 'approve' | 'reject'; notes?: string };
    if (decision === 'reject' && !notes)
      return res.status(422).json({ error: 'Add a rejection reason for the instructor.' });
    const updated = await prisma.courseMaterial.update({
      where: { id: material.id },
      data: {
        status: decision === 'approve' ? ReviewStatus.PUBLISHED : ReviewStatus.REJECTED,
        rejectionReason: decision === 'reject' ? notes : null,
        reviewerId: req.auth!.userId,
        reviewedAt: new Date(),
      },
    });
    await prisma.notification.create({
      data: {
        userId:    material.instructorId,
        category: 'course',
        title:    decision === 'approve' ? 'Material approved' : 'Material needs changes',
        message:  notes || `${material.title} has been reviewed.`,
        targetUrl: '/instructor/courses',
      },
    });
    res.json({ material: updated });
  },
);

// ── Baptism requests ─────────────────────────────────────────────────────────
router.get('/requests', async (_req, res) => {
  const requests = await prisma.portalRequest.findMany({
    where: {
      status: { in: [RequestStatus.PENDING, RequestStatus.APPROVED, RequestStatus.COMPLETED] },
      type: RequestType.BAPTISM,
    },
    include: {
      person: {
        include: {
          member: true,
          courseProgress: { include: { course: true } },
          certificates: true,
          baptisms: true,
        },
      },
      reviewer:    { select: { username: true, person: true } },
      certificate: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 300,
  });
  res.json({ requests });
});

router.post(
  '/requests/:id/review',
  validateBody(
    z.object({
      decision:      z.enum(['approve', 'reject']),
      notes:         z.string().trim().max(3000).optional(),
      scheduledDate: z.coerce.date().optional(),
      scheduledAddress: z.string().trim().min(1).max(500).optional(),
    }),
  ),
  async (req, res) => {
    const request = await prisma.portalRequest.findUnique({
      where: { id: String(String(req.params.id)) },
      include: { certificate: true },
    });
    if (request?.type === RequestType.COURSE_CERTIFICATE)
      return res.status(410).json({ error: 'Course certificates are issued automatically when a course is completed.' });
    if (!request || !([RequestStatus.PENDING, RequestStatus.APPROVED] as RequestStatus[]).includes(request.status))
      return res.status(404).json({ error: 'A pending request was not found.' });

    const { decision, notes, scheduledDate, scheduledAddress } = req.body as {
      decision: 'approve' | 'reject'; notes?: string; scheduledDate?: Date; scheduledAddress?: string;
    };
    if (decision === 'reject' && !notes)
      return res.status(422).json({ error: 'Add a reason so the applicant knows what to do next.' });
    if (decision === 'approve' && request.type === RequestType.BAPTISM && !scheduledDate)
      return res.status(422).json({ error: 'Set the baptism date before approving the request.' });
    if (decision === 'approve' && request.type === RequestType.BAPTISM && !scheduledAddress?.trim())
      return res.status(422).json({ error: 'Enter the baptism address before scheduling.' });

    const updated = await prisma.portalRequest.update({
      where: { id: request.id },
      data: {
        status: decision === 'approve' ? RequestStatus.APPROVED : RequestStatus.REJECTED,
        managerNotes: notes,
        scheduledDate: decision === 'approve' ? scheduledDate : null,
        scheduledAddress: decision === 'approve' ? scheduledAddress!.trim() : null,
        reviewedById: req.auth!.userId,
        reviewedAt: new Date(),
      },
    });

    // Notify the person
    const personUser = await prisma.user.findFirst({
      where: { personId: request.personId },
      select: { id: true },
    });
    if (personUser) {
      await prisma.notification.create({
        data: {
          userId:    personUser.id,
          category: 'request',
          title:    decision === 'approve' ? 'Request approved' : 'Request needs changes',
          message: decision === 'approve' && request.type === RequestType.BAPTISM
            ? `Your baptism has been scheduled for ${scheduledDate!.toLocaleDateString()} at ${scheduledAddress!.trim()}.`
            : notes || `Your ${request.type.toLowerCase().replaceAll('_', ' ')} request has been ${decision === 'approve' ? 'approved' : 'rejected'}.`,
          targetUrl: '/requests',
        },
      });
    }
    res.json({ request: updated });
  },
);

// ── Baptism record (manager only) ────────────────────────────────────────────
router.post(
  '/baptisms/record',
  allowRoles(...managerRoles),
  validateBody(
    z.object({
      requestId:  z.string(),
      baptizedAt: z.coerce.date(),
      location:   z.string().max(200).optional(),
      notes:      z.string().max(2000).optional(),
    }),
  ),
  async (req, res) => {
    const data = req.body as { requestId: string; baptizedAt: Date; location?: string; notes?: string };
    const request = await prisma.portalRequest.findUnique({ where: { id: data.requestId } });
    if (!request || request.type !== RequestType.BAPTISM || request.status !== RequestStatus.APPROVED || !request.reviewedById)
      return res.status(409).json({ error: 'The baptism request must be approved and scheduled before recording the actual baptism.' });

    const baptism = await prisma.$transaction(async tx => {
      const record = await tx.baptism.create({
        data: { personId: request.personId, recordedById: req.auth!.userId, baptizedAt: data.baptizedAt, location: data.location, notes: data.notes },
      });
      const member = await tx.member.upsert({
        where: { personId: request.personId },
        create: { personId: request.personId, membershipNumber: `MEM-${randomBytes(5).toString('hex').toUpperCase()}` },
        update: {},
      });
      await assignMemberToAvailableHomeCell(tx, member.id);
      await tx.user.updateMany({
        where: { personId: request.personId, role: UserRole.WORSHIPER },
        data: { role: UserRole.MEMBER },
      });
      await tx.portalRequest.update({ where: { id: request.id }, data: { status: RequestStatus.COMPLETED } });
      return record;
    });

    const certificate = await issueCertificate({
      personId:  request.personId,
      type:      'BAPTISM',
      requestId: request.id,
      issuerId:  request.reviewedById,
    });

    // Notify the new member
    const personUser = await prisma.user.findFirst({ where: { personId: request.personId }, select: { id: true } });
    if (personUser) {
      await prisma.notification.create({
        data: {
          userId:    personUser.id,
          category: 'baptism',
          title:    'Congratulations! You are now a Member',
          message:  'Your baptism has been recorded. Your account has been upgraded to Member status.',
          targetUrl: '/dashboard',
        },
      });
    }
    res.status(201).json({ baptism, certificate, membershipCreated: true });
  },
);

// ── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications', async (req, res) =>
  res.json({
    notifications: await prisma.notification.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  }),
);

router.patch('/notifications/:id/read', async (req, res) => {
  const updated = await prisma.notification.updateMany({
    where: { id: String(req.params.id), userId: req.auth!.userId },
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

// ── Helpers ───────────────────────────────────────────────────────────────────
async function notifyEligibleLearners(
  category: CourseCategory,
  targetAudience: string,
  title: string,
  minAge: number | null,
  maxAge: number | null,
) {
  const users = await prisma.user.findMany({
    where: { role: { in: [UserRole.WORSHIPER, UserRole.MEMBER] }, isActive: true },
    include: { person: { include: { member: true, parentLinks: { include: { child: true } } } } },
  });
  const eligible = users.filter(user => {
    const isMember   = Boolean(user.person?.member) || user.role === UserRole.MEMBER;
    const isWorshiper = user.role === UserRole.WORSHIPER;
    // Same child-eligibility logic as courses.ts
    const hasChildren = Boolean(
      user.person?.parentLinks.some(link => {
        if (minAge == null && maxAge == null) return true;  // no age restriction
        if (!link.child.dateOfBirth) return true;           // no DOB → include
        const age = Math.floor((Date.now() - link.child.dateOfBirth.getTime()) / 31_557_600_000);
        return (minAge == null || age >= minAge) && (maxAge == null || age <= maxAge);
      }),
    );
    if (category === CourseCategory.BEGINNER)  return isWorshiper;
    if (category === CourseCategory.HOUSEHOLD) return isMember;
    if (category === CourseCategory.CHILDREN)  return (isWorshiper || isMember) && hasChildren;
    if (targetAudience === 'WORSHIPERS')       return isWorshiper;
    if (targetAudience === 'MEMBERS')          return isMember;
    if (targetAudience === 'CHILDREN')         return hasChildren;
    return true;
  });
  if (eligible.length) {
    await prisma.notification.createMany({
      data: eligible.map(user => ({
        userId:    user.id,
        category: 'course',
        title:    'New course available',
        message:  title,
        targetUrl: '/courses',
      })),
    });
  }
}

export default router;
