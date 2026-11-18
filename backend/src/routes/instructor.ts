import { Router } from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { CourseCategory, MaterialType, ReviewStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { allowRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { optionalPersonName, requiredPersonName } from '../validation/personName.js';

const router = Router();
const asParamString = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? '';
const disk = multer.diskStorage({
  destination: path.resolve('uploads'),
  filename: (_req, file, done) => done(null, `${Date.now()}-${randomBytes(12).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
});
const allowedMime = new Set(['video/mp4', 'video/webm', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'text/plain', 'application/zip']);
const fileUpload = multer({ storage: disk, limits: { fileSize: 100 * 1024 * 1024, files: 12 }, fileFilter: (_req, file, done) => allowedMime.has(file.mimetype) ? done(null, true) : done(new Error('Unsupported course material type.')) });
router.use(requireAuth, allowRoles(UserRole.CLASS_INSTRUCTOR));

// Instructors may schedule only Home Cells where they are the assigned leader.
router.get('/home-cells', async (req, res) => {
  const instructor = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { personId: true } });
  if (!instructor?.personId) return res.json({ homeCells: [] });
  const homeCells = await prisma.homeCell.findMany({
    where: { leaderId: instructor.personId, isActive: true },
    select: { id: true, name: true, location: true, meetingDay: true, meetingTime: true, capacity: true },
    orderBy: { name: 'asc' },
  });
  res.json({ homeCells });
});

router.patch('/home-cells/:id/schedule', validateBody(z.object({
  meetingDay: z.string().trim().min(1).max(40),
  meetingTime: z.string().trim().min(1).max(40),
})), async (req, res) => {
  const instructor = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { personId: true } });
  if (!instructor?.personId) return res.status(403).json({ error: 'Your instructor account is not linked to a church person profile.' });
  const id = asParamString(req.params.id);
  const cell = await prisma.homeCell.findFirst({ where: { id, leaderId: instructor.personId, isActive: true } });
  if (!cell) return res.status(404).json({ error: 'No active Home Cell assigned to you was found.' });
  const homeCell = await prisma.homeCell.update({ where: { id: cell.id }, data: req.body });
  res.json({ homeCell });
});

router.get('/dashboard', async (req, res) => {
  const [courses, pendingMaterials, classes, notices] = await Promise.all([
    prisma.course.findMany({ where: { instructorId: req.auth!.userId }, include: { enrollments: true, materials: true }, orderBy: { updatedAt: 'desc' } }),
    prisma.courseMaterial.count({ where: { instructorId: req.auth!.userId, status: ReviewStatus.PENDING_APPROVAL } }),
    prisma.classInstructor.count({ where: { userId: req.auth!.userId } }),
    prisma.notification.findMany({ where: { userId: req.auth!.userId }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);
  res.json({ stats: { totalCourses: courses.length, totalClasses: classes, pendingMaterials, approvedCourses: courses.filter(c => ([ReviewStatus.APPROVED, ReviewStatus.PUBLISHED] as ReviewStatus[]).includes(c.status)).length, rejectedCourses: courses.filter(c => c.status === ReviewStatus.REJECTED).length, publishedCourses: courses.filter(c => c.status === ReviewStatus.PUBLISHED).length, draftCourses: courses.filter(c => c.status === ReviewStatus.DRAFT).length, enrolledStudents: new Set(courses.flatMap(c => c.enrollments.map(e => e.personId))).size, unreadNotifications: notices.filter(n => !n.readAt).length }, courses: courses.slice(0, 10), notifications: notices });
});
router.get('/courses', async (req, res) => {
  const courses = await prisma.course.findMany({ where: { instructorId: req.auth!.userId }, include: { materials: { orderBy: { createdAt: 'desc' } }, enrollments: true }, orderBy: { updatedAt: 'desc' } });
  res.json({ courses });
});
router.post('/courses', validateBody(z.object({ title: z.string().trim().min(2).max(160), category: z.nativeEnum(CourseCategory), description: z.string().max(8000).optional(), duration: z.string().max(100).optional(), objectives: z.string().max(4000).optional(), lessons: z.array(z.string().trim().min(1)).max(100).default([]), thumbnailUrl: z.string().url().optional(), startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(), targetAudience: z.enum(['WORSHIPERS', 'MEMBERS', 'MEMBERS_AND_WORSHIPERS', 'CHILDREN']).default('MEMBERS_AND_WORSHIPERS'), minAge:z.number().int().min(0).max(18).nullable().optional(), maxAge:z.number().int().min(0).max(18).nullable().optional() })), async (req, res) => {
  const data = req.body;
  if (data.startDate && data.endDate && data.endDate < data.startDate) return res.status(422).json({ error: 'The course end date must be after the start date.' });
  if(data.minAge!=null&&data.maxAge!=null&&data.maxAge<data.minAge)return res.status(422).json({error:'The maximum eligible age must be at least the minimum age.'});
  const course = await prisma.course.create({ data: { ...data, instructorId: req.auth!.userId } });
  res.status(201).json({ course });
});
router.patch('/courses/:id', validateBody(z.object({ title: z.string().trim().min(2).max(160).optional(), category: z.nativeEnum(CourseCategory).optional(), description: z.string().max(8000).nullable().optional(), duration: z.string().max(100).nullable().optional(), objectives: z.string().max(4000).nullable().optional(), lessons: z.array(z.string().trim().min(1)).max(100).optional(), startDate: z.coerce.date().nullable().optional(), endDate: z.coerce.date().nullable().optional(), targetAudience: z.enum(['WORSHIPERS', 'MEMBERS', 'MEMBERS_AND_WORSHIPERS', 'CHILDREN']).optional(),minAge:z.number().int().min(0).max(18).nullable().optional(),maxAge:z.number().int().min(0).max(18).nullable().optional() })), async (req, res) => {
  const id = asParamString(req.params.id);
  const course = await prisma.course.findFirst({ where: { id, instructorId: req.auth!.userId } });
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  if (!([ReviewStatus.DRAFT, ReviewStatus.REJECTED] as ReviewStatus[]).includes(course.status)) return res.status(409).json({ error: 'Only draft or rejected courses can be edited.' });
  const updated = await prisma.course.update({ where: { id: course.id }, data: { ...req.body, status: ReviewStatus.DRAFT, rejectionReason: null } });
  res.json({ course: updated });
});
router.delete('/courses/:id', async (req, res) => {
  const id = asParamString(req.params.id);
  const course = await prisma.course.findFirst({ where: { id, instructorId: req.auth!.userId } });
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  if (course.status !== ReviewStatus.PUBLISHED) return res.status(409).json({ error: 'Only published courses can be deleted here.' });
  await prisma.course.delete({ where: { id: course.id } });
  res.status(204).end();
});
router.post('/courses/:id/materials', fileUpload.single('file'), async (req, res) => {
  const id = asParamString(req.params.id);
  const course = await prisma.course.findFirst({ where: { id, instructorId: req.auth!.userId } });
  if (!course || !([ReviewStatus.DRAFT, ReviewStatus.REJECTED, ReviewStatus.PUBLISHED] as ReviewStatus[]).includes(course.status)) return res.status(404).json({ error: 'An editable or published course belonging to this instructor was not found.' });
  if (!req.file && !req.body.onlineUrl) return res.status(422).json({ error: 'Upload a material file or provide an online meeting/resource URL.' });
  const materialType = String(req.body.type ?? 'OTHER') as MaterialType;
  if (!Object.values(MaterialType).includes(materialType)) return res.status(422).json({ error: 'Choose a valid material type.' });
  const lessonCount = Array.isArray(course.lessons) ? course.lessons.length : 0;
  const lessonNumber = req.body.lessonNumber === undefined || req.body.lessonNumber === '' ? null : Number(req.body.lessonNumber);
  if (lessonNumber !== null && (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > lessonCount))
    return res.status(422).json({ error: 'Choose a valid course lesson for this material.' });
  if (materialType === MaterialType.VIDEO && (!Number.isInteger(lessonNumber) || lessonNumber! < 1 || lessonNumber! > lessonCount))
    return res.status(422).json({ error: 'Assign each video to a valid course lesson.' });
  const status = course.status === ReviewStatus.PUBLISHED ? ReviewStatus.PENDING_APPROVAL : ReviewStatus.DRAFT;
  const material = await prisma.courseMaterial.create({ data: { courseId: course.id, instructorId: req.auth!.userId, title: String(req.body.title || req.file?.originalname || 'Online course material'), type: materialType === MaterialType.VIDEO ? MaterialType.VIDEO : req.body.onlineUrl ? MaterialType.ONLINE_MEETING : materialType, lessonNumber, fileUrl: req.file ? `/uploads/${req.file.filename}` : null, onlineUrl: req.body.onlineUrl || null, status } });
  if (status === ReviewStatus.PENDING_APPROVAL) await notifyManagers('New course material submitted', `${course.title} has new material waiting for Church Manager review.`);
  res.status(201).json({ material });
});
router.post('/courses/:id/submit', async (req, res) => {
  const id = asParamString(req.params.id);
  const course = await prisma.course.findFirst({ where: { id, instructorId: req.auth!.userId } });
  if (!course || !([ReviewStatus.DRAFT, ReviewStatus.REJECTED] as ReviewStatus[]).includes(course.status)) return res.status(409).json({ error: 'Only your saved draft or rejected course can be submitted.' });
  const [updated] = await prisma.$transaction([
    prisma.course.update({ where: { id: course.id }, data: { status: ReviewStatus.PENDING_APPROVAL, rejectionReason: null } }),
    prisma.courseMaterial.updateMany({ where: { courseId: course.id, instructorId: req.auth!.userId, status: { in: [ReviewStatus.DRAFT, ReviewStatus.REJECTED] } }, data: { status: ReviewStatus.PENDING_APPROVAL, rejectionReason: null } }),
  ]);
  await notifyManagers('Course submitted for approval', `${course.title} is waiting for Church Manager review.`);
  res.json({ course: updated });
});
router.post('/profile/signature', validateBody(z.object({ signatureData: z.string().max(100_000).nullable() })), async (req, res) => {
  res.json({ user: await prisma.user.update({ where: { id: req.auth!.userId }, data: { signatureData: req.body.signatureData }, select: { id: true, signatureData: true } }) });
});
router.patch('/profile', validateBody(z.object({firstName:requiredPersonName.optional(),middleName:optionalPersonName.nullable().optional(),lastName:requiredPersonName.optional(),phone:z.string().max(40).nullable().optional(),occupation:z.string().max(100).nullable().optional()})),async(req,res)=>{
 if (req.body.phone !== undefined) return res.status(403).json({ error: 'Contact details can only be changed by an Administrator.' });
 const { phone: _phone, ...profileFields } = req.body;
 const user=await prisma.user.findUniqueOrThrow({where:{id:req.auth!.userId},select:{personId:true}});if(!user.personId)return res.status(422).json({error:'Ask an Administrator to link your instructor account to a church person profile.'});res.json({person:await prisma.person.update({where:{id:user.personId},data:profileFields})});
});
router.get('/notifications', async (req, res) => res.json({ notifications: await prisma.notification.findMany({ where: { userId: req.auth!.userId }, orderBy: { createdAt: 'desc' }, take: 100 }) }));

async function notifyManagers(title: string, message: string) {
  const managers = await prisma.user.findMany({ where: { role: UserRole.CHURCH_MANAGER, isActive: true }, select: { id: true } });
  if (managers.length) await prisma.notification.createMany({ data: managers.map(user => ({ userId: user.id, category: 'course', title, message, targetUrl: '/manager/courses' })) });
}

export default router;
