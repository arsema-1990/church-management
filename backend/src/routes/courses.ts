import { Router } from 'express';
import { z } from 'zod';
import { CourseCategory, ReviewStatus, UserRole } from '@prisma/client';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { issueCertificate } from '../services/certificates.js';
import { getCourseSequenceAccess } from '../services/courseSequence.js';

const router = Router();
const asParamString = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? '';
router.use(requireAuth);

type EligibilityProfile = {
  member: { id: string } | null;
  parentLinks: Array<{ child: { dateOfBirth: Date | null } }>;
};

function isEligibleForCourse(
  role: UserRole,
  person: EligibilityProfile | null,
  course: { category: CourseCategory; targetAudience: string; minAge?: number | null; maxAge?: number | null },
) {
  const isMember   = Boolean(person?.member) || role === UserRole.MEMBER;
  const isWorshiper = role === UserRole.WORSHIPER;

  // A person "has children" if they have registered at least one child whose age
  // falls within the course's age range (or no age range is specified).
  const hasChildren = Boolean(
    person?.parentLinks.some(link => {
      // No age restriction on the course → any registered child qualifies
      if (course.minAge == null && course.maxAge == null) return true;
      // Child has no date of birth recorded → include (benefit of the doubt)
      if (!link.child.dateOfBirth) return true;
      const childAge = Math.floor(
        (Date.now() - link.child.dateOfBirth.getTime()) / 31_557_600_000,
      );
      return (
        (course.minAge == null || childAge >= course.minAge) &&
        (course.maxAge == null || childAge <= course.maxAge)
      );
    }),
  );

  // A member has moved beyond the Beginner Course and receives member courses.
  if (course.category === CourseCategory.BEGINNER)  return isWorshiper && !isMember;
  if (course.category === CourseCategory.HOUSEHOLD) return isMember;

  // Children course: visible to WORSHIPER or MEMBER who has registered children
  if (course.category === CourseCategory.CHILDREN)
    return (isWorshiper || isMember) && hasChildren;

  // Normal / Day-to-Day: fall back to targetAudience
  if (course.targetAudience === 'WORSHIPERS') return isWorshiper;
  if (course.targetAudience === 'MEMBERS')    return isMember;
  if (course.targetAudience === 'CHILDREN')   return hasChildren;

  // MEMBERS_AND_WORSHIPERS (default)
  return isWorshiper || isMember;
}

async function eligiblePublishedCourseSequence(
  userId: string,
  role: UserRole,
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      personId: true,
      person: {
        select: {
          member: { select: { id: true } },
          parentLinks: { select: { child: { select: { dateOfBirth: true } } } },
        },
      },
    },
  });
  const courses = await prisma.course.findMany({
    where: { status: ReviewStatus.PUBLISHED },
    select: {
      id: true, title: true, description: true, category: true, status: true,
      rejectionReason: true, targetAudience: true, minAge: true, maxAge: true,
      duration: true, thumbnailUrl: true,
    },
    orderBy: [{ category: 'asc' }, { title: 'asc' }],
  });
  return {
    personId: user.personId,
    courses: courses.filter(course => isEligibleForCourse(role, user.person, course)),
  };
}

async function getUserCourseSequenceAccess(sequence: Awaited<ReturnType<typeof eligiblePublishedCourseSequence>>) {
  const progress = sequence.personId
    ? await prisma.courseProgress.findMany({
      where: {
        personId: sequence.personId,
        courseId: { in: sequence.courses.map(course => course.id) },
      },
      select: { courseId: true, percentage: true },
    })
    : [];
  const completedCourseIds = new Set(progress.filter(item => item.percentage >= 100).map(item => item.courseId));
  return {
    progress,
    access: getCourseSequenceAccess(sequence.courses, completedCourseIds),
  };
}

router.get('/', async (req, res) => {
  const sequence = await eligiblePublishedCourseSequence(req.auth!.userId, req.auth!.role);
  const { progress, access } = await getUserCourseSequenceAccess(sequence);
  const accessById = new Map(access.map(item => [item.courseId, item]));
  res.json({
    courses: sequence.courses.map(course => ({
      ...course,
      progressPercentage: progress.find(item => item.courseId === course.id)?.percentage ?? 0,
      ...accessById.get(course.id),
    })),
  });
});
router.get('/classes', async (_req, res) => {
  const classes = await prisma.churchClass.findMany({
    where: { status: 'Active' },
    include: {
      instructors: {
        include: {
          user: {
            select: {
              username: true,
              person: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  res.json({ classes });
});
router.get('/:id', async (req, res) => {
  const id = asParamString(req.params.id);
  const course = await prisma.course.findFirst({ where: { id, status: ReviewStatus.PUBLISHED }, include: { materials: { where: { status: ReviewStatus.PUBLISHED }, orderBy: [{ lessonNumber: 'asc' }, { createdAt: 'asc' }] }, instructor: { select: { username: true, person: true } } } });
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  const sequence = await eligiblePublishedCourseSequence(req.auth!.userId, req.auth!.role);
  if (!sequence.courses.some(item => item.id === course.id)) return res.status(404).json({ error: 'Course not found.' });
  const { access } = await getUserCourseSequenceAccess(sequence);
  const courseAccess = access.find(item => item.courseId === course.id);
  if (courseAccess?.locked) {
    return res.status(403).json({
      code: 'COURSE_LOCKED',
      error: `Complete ${courseAccess.lockedByCourseTitle} before opening this course.`,
    });
  }
  const personId = sequence.personId;
  const progress = personId ? await prisma.courseProgress.findUnique({ where: { personId_courseId: { personId, courseId: course.id } } }) : null;
  res.json({ course, progress });
});
router.post('/:id/progress', validateBody(z.object({
  watchedVideoSegments: z.record(z.string(), z.array(z.number().int().min(0).max(99)).max(100)),
  watchedBiblePages: z.record(z.string(), z.object({
    pageCount: z.number().int().min(1).max(10_000),
    pages: z.array(z.number().int().min(0).max(9_999)).max(10_000),
  })).default({}),
  manualCompletedLessons: z.array(z.number().int().min(0).max(199)).max(200).default([]),
})), async (req, res) => {
  const id = asParamString(req.params.id);
  const course = await prisma.course.findFirst({ where: { id, status: ReviewStatus.PUBLISHED } });
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  const sequence = await eligiblePublishedCourseSequence(req.auth!.userId, req.auth!.role);
  if (!sequence.courses.some(item => item.id === course.id)) return res.status(404).json({ error: 'Course not found.' });
  const { access } = await getUserCourseSequenceAccess(sequence);
  const courseAccess = access.find(item => item.courseId === course.id);
  if (courseAccess?.locked) {
    return res.status(403).json({
      code: 'COURSE_LOCKED',
      error: `Complete ${courseAccess.lockedByCourseTitle} before updating progress in this course.`,
    });
  }
  if (!sequence.personId) return res.status(422).json({ error: 'This account needs a church person profile before tracking course progress.' });
  const personId = sequence.personId;
  const lessons = Array.isArray(course.lessons) ? course.lessons : [];
  const total = lessons.length;
  if (!total) return res.status(422).json({ error: 'Course lessons have not been configured.' });
  const videoMaterials = await prisma.courseMaterial.findMany({
    where: { courseId: course.id, status: ReviewStatus.PUBLISHED, type: 'VIDEO', lessonNumber: { not: null } },
    select: { id: true, lessonNumber: true },
  });
  const videosById = new Map(videoMaterials.map(material => [material.id, material]));
  const existingProgress = await prisma.courseProgress.findUnique({
    where: { personId_courseId: { personId, courseId: course.id } },
    select: { completedLessons: true, watchedVideoSegments: true, watchedBiblePages: true },
  });
  const existingWatched = existingProgress?.watchedVideoSegments && typeof existingProgress.watchedVideoSegments === 'object' && !Array.isArray(existingProgress.watchedVideoSegments)
    ? existingProgress.watchedVideoSegments as Record<string, number[]>
    : {};
  const watchedVideoSegments = Object.fromEntries(
    Object.entries(existingWatched).filter(([videoId]) => videosById.has(videoId)),
  );
  const incomingWatched = req.body.watchedVideoSegments as Record<string, number[]>;
  const existingBible = existingProgress?.watchedBiblePages
    && typeof existingProgress.watchedBiblePages === 'object'
    && !Array.isArray(existingProgress.watchedBiblePages)
    ? existingProgress.watchedBiblePages as Record<string, { pageCount: number; pages: number[] }>
    : {};
  const watchedBiblePages = { ...existingBible };
  const bibleMaterials = await prisma.courseMaterial.findMany({
    where: { courseId: course.id, status: ReviewStatus.PUBLISHED, type: 'PDF_BOOK', lessonNumber: { not: null }, fileUrl: { not: null } },
    select: { id: true, lessonNumber: true },
  });
  const biblesById = new Set(bibleMaterials.map(material => material.id));

  for (const [videoId, segments] of Object.entries(incomingWatched)) {
    if (!videosById.has(videoId)) continue;
    watchedVideoSegments[videoId] = [...new Set([...(existingWatched[videoId] ?? []), ...segments])];
  }
  for (const [materialId, reading] of Object.entries(req.body.watchedBiblePages as Record<string, { pageCount: number; pages: number[] }>)) {
    if (!biblesById.has(materialId)) return res.status(422).json({ error: 'Bible reading progress included a book not assigned to this published course.' });
    const pages = [...new Set([...(existingBible[materialId]?.pages ?? []), ...reading.pages])]
      .filter(page => page >= 0 && page < reading.pageCount)
      .sort((a, b) => a - b);
    watchedBiblePages[materialId] = {
      pageCount: Math.max(existingBible[materialId]?.pageCount ?? 0, reading.pageCount),
      pages,
    };
  }

  const existingCompleted = Array.isArray(existingProgress?.completedLessons)
    ? (existingProgress.completedLessons as number[]).filter(index => Number.isInteger(index) && index >= 0 && index < total)
    : [];
  const completed = new Set(existingCompleted);
  const manualCompletedLessons = new Set(req.body.manualCompletedLessons as number[]);
  if ([...manualCompletedLessons].some(index => index >= total))
    return res.status(422).json({ error: 'Choose a valid lesson to mark as finished.' });

  const videoCompletedLessons = new Set<number>();
  for (let lessonIndex = 0; lessonIndex < total; lessonIndex++) {
    const lessonVideos = videoMaterials.filter(material => material.lessonNumber === lessonIndex + 1);
    const lessonBibles = bibleMaterials.filter(material => material.lessonNumber === lessonIndex + 1);
    const videosComplete = lessonVideos.length > 0
      && lessonVideos.every(video => (watchedVideoSegments[video.id]?.length ?? 0) >= 95);
    const bibleComplete = lessonBibles.every(material => {
      const reading = watchedBiblePages[material.id];
      return Boolean(reading && reading.pageCount > 0 && reading.pages.length >= Math.ceil(reading.pageCount * 0.95));
    });
    if (videosComplete && bibleComplete)
      videoCompletedLessons.add(lessonIndex);
  }

  for (let lessonIndex = 0; lessonIndex < total; lessonIndex++) {
    if (completed.has(lessonIndex)) continue;
    if (manualCompletedLessons.has(lessonIndex) || videoCompletedLessons.has(lessonIndex)) {
      completed.add(lessonIndex);
      continue;
    }
    if ([...manualCompletedLessons].some(index => index > lessonIndex))
      return res.status(409).json({ error: 'Finish lessons in order before marking a later lesson complete.' });
    break;
  }
  const completedLessons = [...completed].sort((a, b) => a - b);
  const percentage = Math.round(completedLessons.length / total * 100);
  const courseCompleted = completedLessons.length === total;
  await prisma.courseEnrollment.upsert({ where: { courseId_personId: { courseId: course.id, personId } }, create: { courseId: course.id, personId, status: courseCompleted ? 'Completed' : 'Active' }, update: { status: courseCompleted ? 'Completed' : 'Active' } });
  const progress = await prisma.courseProgress.upsert({ where: { personId_courseId: { personId, courseId: course.id } }, create: { personId, courseId: course.id, completedLessons, watchedVideoSegments, watchedBiblePages, percentage }, update: { completedLessons, watchedVideoSegments, watchedBiblePages, percentage } });
  let certificate = null;
  let certificateIssueError: string | undefined;
  if (courseCompleted) {
    const issuer = await prisma.user.findFirst({
      where: { role: UserRole.CHURCH_MANAGER, isActive: true, signatureData: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, signatureData: true },
    });
    if (!issuer?.signatureData?.trim()) {
      certificateIssueError = 'Progress saved. An active Church Manager signature must be configured before issuing the certificate.';
    } else {
      const existing = await prisma.certificate.findUnique({
        where: { personId_courseId: { personId, courseId: course.id } },
        select: { id: true },
      });
      try {
        certificate = await issueCertificate({
          personId,
          type: 'COURSE',
          issuerId: issuer.id,
          courseId: course.id,
          courseTitleSnapshot: course.title,
        });
      } catch (error) {
        console.error('Automatic course certificate issuance failed:', error);
        certificateIssueError = 'Progress saved, but the certificate could not be issued. Please contact the Church Manager.';
      }

      if (certificate) {
        const legacyRequests = await prisma.portalRequest.findMany({
          where: {
            personId,
            type: 'COURSE_CERTIFICATE',
            status: { in: ['PENDING', 'APPROVED'] },
          },
          select: { id: true, managerNotes: true },
        });
        for (const request of legacyRequests) {
          await prisma.portalRequest.update({
            where: { id: request.id },
            data: {
              status: 'COMPLETED',
              managerNotes: [request.managerNotes, `Certificate issued automatically for ${course.title}.`].filter(Boolean).join('\n'),
              reviewedById: issuer.id,
              reviewedAt: new Date(),
            },
          });
        }

        if (!existing) {
          const personUser = await prisma.user.findFirst({ where: { personId }, select: { id: true } });
          if (personUser) {
            try {
              await prisma.notification.create({
                data: {
                  userId: personUser.id,
                  category: 'course',
                  title: 'Course certificate issued',
                  message: `Your certificate for ${course.title} has been issued.`,
                  targetUrl: '/certificates',
                },
              });
            } catch (error) {
              console.error('Course certificate notification failed:', error);
            }
          }
        }
      }
    }
  }
  res.json({ progress, certificate, certificateIssueError });
});
export default router;
