/**
 * Seed 4 complete published courses with lessons, YouTube videos, Bible study
 * materials, quizzes, and assignments.
 *
 * Run after the main seed and seed-manager:
 *   npx tsx prisma/seed-courses.ts
 */
import 'dotenv/config';
import { prisma } from '../src/prisma.js';
import type { CourseCategory, MaterialType, ReviewStatus } from '@prisma/client';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const PUBLISHED: ReviewStatus  = 'PUBLISHED'  as ReviewStatus;
const DRAFT:     ReviewStatus  = 'DRAFT'       as ReviewStatus;
const seedAdditionalCourses = process.env.SEED_ADDITIONAL_COURSES === 'true';
const seedAdvancedCourse = process.env.SEED_ADVANCED_COURSE === 'true';

type MatInput = {
  title:       string;
  type:        MaterialType;
  onlineUrl?:  string;
  fileUrl?:    string;
  lessonNumber?: number;
  status:      ReviewStatus;
};

/* ─── YouTube helpers (embed URL → usable link) ───────────────────────────── */
// We store full YouTube watch URLs; the frontend renders them as clickable links.
const yt = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/* ═══════════════════════════════════════════════════════════════════════════ */
async function main() {
  /* ── 1. Find the instructor account ── */
  const instructor = await prisma.user.findFirst({
    where: { role: 'CLASS_INSTRUCTOR' },
  });
  if (!instructor) {
    throw new Error(
      'No CLASS_INSTRUCTOR account found. Run seed-manager.ts first.',
    );
  }

  /* ── 2. Find or create the reviewer (admin/manager) ── */
  const reviewer = await prisma.user.findFirst({
    where: { role: { in: ['ADMINISTRATOR', 'CHURCH_MANAGER'] } },
    orderBy: { createdAt: 'asc' },
  });
  if (!reviewer) {
    throw new Error('No ADMINISTRATOR or CHURCH_MANAGER found. Run seed.ts first.');
  }

  console.log(`Instructor : ${instructor.email}`);
  console.log(`Reviewer   : ${reviewer.email}`);
  console.log('Seeding courses…\n');

  /* ═══════════════════════════════════════════════════════════════════════
     COURSE 1 — BEGINNER COURSE
     Target: New Worshipers
     ═══════════════════════════════════════════════════════════════════════ */
  await upsertCourse(instructor.id, reviewer.id, {
    title:       'Beginner Course — Foundation of Faith',
    category:    'BEGINNER'           as CourseCategory,
    description: `A short introduction for new worshipers covering who God is, the Gospel of Jesus Christ, and how to begin a life of prayer. Complete all three lessons to finish the course.`,
    duration:      '',
    targetAudience:'WORSHIPERS' as any,
    objectives: `• Understand who God is and the Trinity
• Understand the Gospel through the death and resurrection of Jesus
• Learn a simple pattern for daily prayer`,
    lessons: [
      'Lesson 1 — Who Is God? Understanding the Trinity',
      'Lesson 2 — The Gospel: The Death and Resurrection of Jesus',
      'Lesson 3 — Prayer: Talking with God Every Day',
    ],
    materials: [
      // Lesson 1
      { lessonNumber: 1, title: 'Video — The Trinity Explained', type: 'VIDEO' as MaterialType, onlineUrl: yt('eAvYmE2YYIU'), status: PUBLISHED },
      { lessonNumber: 1, title: 'Bible Reading — Genesis 1:1 and John 1:1-14 (The Beginning)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Genesis+1%3A1%2C+John+1%3A1-14&version=NIV', status: PUBLISHED },
      { lessonNumber: 1, title: 'Study Notes — The Trinity Explained', type: 'DOCUMENT' as MaterialType, onlineUrl: 'https://www.gotquestions.org/Trinity-Bible.html', status: PUBLISHED },
      // Lesson 2
      { lessonNumber: 2, title: 'Video — Gospel of Mark Summary', type: 'VIDEO' as MaterialType, onlineUrl: yt('HGHqu9-DtXk'), status: PUBLISHED },
      { lessonNumber: 2, title: 'Bible Reading — John 3:16-21 and 1 Corinthians 15:1-8', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=John+3%3A16-21%2C+1+Corinthians+15%3A1-8&version=NIV', status: PUBLISHED },
      // Lesson 3
      { lessonNumber: 3, title: 'Video — The Lord’s Prayer Could Rewire Your Daily Life', type: 'VIDEO' as MaterialType, onlineUrl: yt('3-YlqQfKkKk'), status: PUBLISHED },
      { lessonNumber: 3, title: 'Bible Reading — Matthew 6:5-15 (The Lord\'s Prayer)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Matthew+6%3A5-15&version=NIV', status: PUBLISHED },
      { lessonNumber: 3, title: 'Assignment — Daily Prayer Journal', type: 'ASSIGNMENT' as MaterialType, onlineUrl: 'https://www.crosswalk.com/faith/prayer/how-to-start-a-prayer-journal.html', status: PUBLISHED },
      // Lesson 4
      { lessonNumber: 4, title: 'Video — How to Receive Salvation', type: 'VIDEO' as MaterialType, onlineUrl: yt('UOYSEjEaWMU'), status: PUBLISHED },
      { lessonNumber: 4, title: 'Bible Reading — Romans 10:9-13 (The Way of Salvation)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Romans+10%3A9-13&version=NIV', status: PUBLISHED },
      { lessonNumber: 4, title: 'Assignment — Write Your Personal Testimony (1 page)', type: 'ASSIGNMENT' as MaterialType, onlineUrl: 'https://www.gotquestions.org/personal-testimony.html', status: PUBLISHED },
      // Lesson 5
      { lessonNumber: 5, title: 'Video — How to Read and Study the Bible', type: 'VIDEO' as MaterialType, onlineUrl: yt('HGHqu9-DtXk'), status: PUBLISHED },
      { lessonNumber: 5, title: 'Bible Reading — 2 Timothy 3:16-17 and Psalm 119:105', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=2+Timothy+3%3A16-17%2C+Psalm+119%3A105&version=NIV', status: PUBLISHED },
      { lessonNumber: 5, title: 'PDF Book — Bible Study Methods for New Believers', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.thegospelcoalition.org/article/how-to-study-the-bible/', status: PUBLISHED },
      // Lesson 6
      { lessonNumber: 6, title: 'Video — The Power of Prayer — Talking with God', type: 'VIDEO' as MaterialType, onlineUrl: yt('u9z3AebG0rQ'), status: PUBLISHED },
      { lessonNumber: 6, title: 'Bible Reading — Matthew 6:5-15 (The Lord\'s Prayer)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Matthew+6%3A5-15&version=NIV', status: PUBLISHED },
      { lessonNumber: 6, title: 'Assignment — Daily Prayer Journal (7 days)', type: 'ASSIGNMENT' as MaterialType, onlineUrl: 'https://www.crosswalk.com/faith/prayer/how-to-start-a-prayer-journal.html', status: PUBLISHED },
      // Lesson 7
      { lessonNumber: 7, title: 'Video — The Meaning and Importance of Baptism', type: 'VIDEO' as MaterialType, onlineUrl: yt('GJdNh17bpgY'), status: PUBLISHED },
      { lessonNumber: 7, title: 'Bible Reading — Matthew 28:19-20 and Acts 2:38', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Matthew+28%3A19-20%2C+Acts+2%3A38&version=NIV', status: PUBLISHED },
      // Lesson 8
      { lessonNumber: 8, title: 'Video — What Is Church Membership?', type: 'VIDEO' as MaterialType, onlineUrl: yt('oXzZjSNHhW4'), status: PUBLISHED },
      { lessonNumber: 8, title: 'Bible Reading — Hebrews 10:24-25 and Acts 2:42-47', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Hebrews+10%3A24-25%2C+Acts+2%3A42-47&version=NIV', status: PUBLISHED },
      // Lesson 9
      { lessonNumber: 9, title: 'Video — Living a New Life in Christ', type: 'VIDEO' as MaterialType, onlineUrl: yt('vZRNxFBuHiI'), status: PUBLISHED },
      { lessonNumber: 9, title: 'Bible Reading — 2 Corinthians 5:17 and Galatians 2:20', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=2+Corinthians+5%3A17%2C+Galatians+2%3A20&version=NIV', status: PUBLISHED },
      // Lesson 10
      { lessonNumber: 10, title: 'Quiz — Beginner Course Final Assessment', type: 'QUIZ' as MaterialType, onlineUrl: 'https://www.biblegateway.com/reading-plans/', status: PUBLISHED },
      { lessonNumber: 10, title: 'Video — Your Next Step: Baptism and Membership', type: 'VIDEO' as MaterialType, onlineUrl: yt('cMhLBYDWFXU'), status: PUBLISHED },
      { lessonNumber: 10, title: 'Online Q&A Session with Instructor — Live Meeting', type: 'ONLINE_MEETING' as MaterialType, onlineUrl: 'https://meet.google.com/', status: PUBLISHED },
    ],
  });

  const beginnerCourse = await prisma.course.findFirstOrThrow({
    where: { title: 'Beginner Course — Foundation of Faith', instructorId: instructor.id },
    select: { id: true },
  });
  const learnerProgress = await prisma.courseProgress.findMany({
    where: { courseId: beginnerCourse.id },
    select: { personId: true, completedLessons: true },
  });
  await Promise.all(learnerProgress.map(async progress => {
    const completedLessons = Array.isArray(progress.completedLessons)
      ? progress.completedLessons.filter((lesson): lesson is number =>
        typeof lesson === 'number' && Number.isInteger(lesson) && lesson >= 0 && lesson < 3,
      )
      : [];
    const percentage = Math.round(completedLessons.length / 3 * 100);
    await Promise.all([
      prisma.courseProgress.update({
        where: { personId_courseId: { personId: progress.personId, courseId: beginnerCourse.id } },
        data: { completedLessons, watchedVideoSegments: {}, watchedBiblePages: {}, percentage },
      }),
      prisma.courseEnrollment.updateMany({
        where: { personId: progress.personId, courseId: beginnerCourse.id },
        data: { status: percentage === 100 ? 'Completed' : 'Active' },
      }),
    ]);
  }));

  if (!seedAdditionalCourses) {
    const archivedCourses = await prisma.course.updateMany({
      where: { category: { not: 'BEGINNER' }, status: { not: 'ARCHIVED' } },
      data: { status: 'ARCHIVED' },
    });
    console.log(`Archived ${archivedCourses.count} non-beginner courses.`);
    console.log('\n✅ 1 beginner course with 3 lessons is ready.');
    return;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     COURSE 2 — HOME CELL COURSE (HOUSEHOLD)
     Target: Members / Household
     ═══════════════════════════════════════════════════════════════════════ */
  await upsertCourse(instructor.id, reviewer.id, {
    title:       'Home Cell Course — Growing Together in Faith',
    category:    'HOUSEHOLD' as CourseCategory,
    description: `This course is designed for church members who are part of a Home Cell. It deepens your understanding of community, fellowship, and spiritual growth within the context of your Home Cell family.

You will study the Bible together, learn how to lead and participate in prayer meetings, understand the purpose of the Home Cell in the church, and grow spiritually as a household.`,
    duration:     '6 weeks · Once per week with your Home Cell',
    targetAudience: 'MEMBERS' as any,
    objectives: `• Understand the purpose and vision of the Home Cell ministry
• Learn how to lead and participate in Bible study within your cell
• Develop stronger prayer habits within your household
• Study key scriptures on fellowship, love, and community
• Apply spiritual disciplines in your daily family life
• Support and encourage fellow Home Cell members
• Grow as a servant leader within your community`,
    lessons: [
      'Lesson 1 — What Is a Home Cell? God\'s Design for Community',
      'Lesson 2 — The Early Church as a Model for Home Cells',
      'Lesson 3 — How to Lead a Home Cell Bible Study',
      'Lesson 4 — Prayer in the Home Cell — Interceding Together',
      'Lesson 5 — Serving One Another — Love in Action',
      'Lesson 6 — Growing as a Spiritual Family',
      'Lesson 7 — Evangelism Through the Home Cell',
      'Lesson 8 — Conflict Resolution in Christian Community',
      'Lesson 9 — Spiritual Disciplines for the Household',
      'Lesson 10 — Vision and Mission of the Home Cell',
      'Lesson 11 — Final Project — Lead a Home Cell Session',
    ],
    materials: [
      { lessonNumber: 1, title: 'Video — God\'s Design for Christian Community', type: 'VIDEO' as MaterialType, onlineUrl: yt('Y4BKalBHiaw'), status: PUBLISHED },
      { lessonNumber: 1, title: 'Bible Reading — Acts 2:42-47 (The Early Community)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Acts+2%3A42-47&version=NIV', status: PUBLISHED },
      { lessonNumber: 2, title: 'Video — The Early Church Model for Small Groups', type: 'VIDEO' as MaterialType, onlineUrl: yt('t6nSBGsIBcA'), status: PUBLISHED },
      { lessonNumber: 2, title: 'Bible Reading — Romans 16:3-5 and Philemon 1:2 (House Churches)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Romans+16%3A3-5%2C+Philemon+1%3A2&version=NIV', status: PUBLISHED },
      { lessonNumber: 3, title: 'Video — How to Lead an Effective Bible Study', type: 'VIDEO' as MaterialType, onlineUrl: yt('7DLiEi_5CRU'), status: PUBLISHED },
      { lessonNumber: 3, title: 'Bible Reading — Ezra 7:10 and Nehemiah 8:8', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Ezra+7%3A10%2C+Nehemiah+8%3A8&version=NIV', status: PUBLISHED },
      { lessonNumber: 3, title: 'Assignment — Prepare a 30-minute Home Cell Bible Study Plan', type: 'ASSIGNMENT' as MaterialType, onlineUrl: 'https://www.navigators.org/resource/bible-study-methods/', status: PUBLISHED },
      { lessonNumber: 4, title: 'Video — The Power of Corporate Prayer', type: 'VIDEO' as MaterialType, onlineUrl: yt('uVMBcxKHjXE'), status: PUBLISHED },
      { lessonNumber: 4, title: 'Bible Reading — Matthew 18:19-20 and James 5:16', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Matthew+18%3A19-20%2C+James+5%3A16&version=NIV', status: PUBLISHED },
      { lessonNumber: 5, title: 'Video — Serving One Another in Love', type: 'VIDEO' as MaterialType, onlineUrl: yt('5HVhJPqPUXE'), status: PUBLISHED },
      { lessonNumber: 5, title: 'Bible Reading — John 13:34-35 and Galatians 6:2', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=John+13%3A34-35%2C+Galatians+6%3A2&version=NIV', status: PUBLISHED },
      { lessonNumber: 6, title: 'Video — Spiritual Growth as a Family', type: 'VIDEO' as MaterialType, onlineUrl: yt('cOgUtBLSjSI'), status: PUBLISHED },
      { lessonNumber: 7, title: 'Video — Home Cell Evangelism — Reaching Your Neighborhood', type: 'VIDEO' as MaterialType, onlineUrl: yt('BYMOJkIOqCE'), status: PUBLISHED },
      { lessonNumber: 7, title: 'Bible Reading — Acts 1:8 and 1 Peter 3:15', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Acts+1%3A8%2C+1+Peter+3%3A15&version=NIV', status: PUBLISHED },
      { lessonNumber: 8, title: 'Video — Conflict Resolution the Christian Way', type: 'VIDEO' as MaterialType, onlineUrl: yt('GvMBnF_v_UA'), status: PUBLISHED },
      { lessonNumber: 8, title: 'Bible Reading — Matthew 18:15-17 and Ephesians 4:29-32', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Matthew+18%3A15-17%2C+Ephesians+4%3A29-32&version=NIV', status: PUBLISHED },
      { lessonNumber: 9, title: 'Video — Spiritual Disciplines for Daily Life', type: 'VIDEO' as MaterialType, onlineUrl: yt('SjGdCBIzpGc'), status: PUBLISHED },
      { lessonNumber: 9, title: 'Assignment — 21-Day Family Devotional Plan', type: 'ASSIGNMENT' as MaterialType, onlineUrl: 'https://www.focusonthefamily.com/faith/family-devotions/', status: PUBLISHED },
      { lessonNumber: 10, title: 'Video — Vision and Mission of the Home Cell Ministry', type: 'VIDEO' as MaterialType, onlineUrl: yt('N6eLKbXcVxs'), status: PUBLISHED },
      { lessonNumber: 11, title: 'Final Project — Record Your Home Cell Session (Video/Audio)', type: 'ASSIGNMENT' as MaterialType, onlineUrl: 'https://www.cellchurch.com/', status: PUBLISHED },
      { lessonNumber: 11, title: 'Online Group Meeting — Home Cell Course Graduation', type: 'ONLINE_MEETING' as MaterialType, onlineUrl: 'https://meet.google.com/', status: PUBLISHED },
    ],
  });

  /* ═══════════════════════════════════════════════════════════════════════
     COURSE 3 — CHILDREN COURSE
     Target: Children (Age 5-15)
     ═══════════════════════════════════════════════════════════════════════ */
  await upsertCourse(instructor.id, reviewer.id, {
    title:       'Children\'s Bible Course — Heroes of Faith',
    category:    'CHILDREN' as CourseCategory,
    description: `A fun, engaging, and age-appropriate Bible course for children ages 5-15. Through stories, songs, games, and interactive activities, children will discover the heroes of the Bible, learn key Bible verses, and grow in their love for God.

Parents can follow along with their children and help them complete activities at home. This course is available when a parent/guardian has registered their children in the church system.`,
    duration:     '10 weeks · One session per week',
    targetAudience:'CHILDREN' as any,
    minAge:       5,
    maxAge:       15,
    objectives: `• Learn about the great heroes of the Bible
• Memorize key Bible verses for life
• Understand God's love for children
• Grow in prayer and worship
• Learn values like honesty, kindness, courage, and faith
• Develop a love for reading the Bible
• Build friendships and community with other church children`,
    lessons: [
      'Lesson 1 — God Made Everything! (Creation Story)',
      'Lesson 2 — Noah and the Rainbow — God\'s Promise',
      'Lesson 3 — Abraham — The Father of Faith',
      'Lesson 4 — Joseph — From the Pit to the Palace',
      'Lesson 5 — Moses — God Leads His People',
      'Lesson 6 — David and Goliath — Courage in God',
      'Lesson 7 — Daniel in the Lions\' Den — Faithful to God',
      'Lesson 8 — The Birth of Jesus — Good News for All',
      'Lesson 9 — Jesus Loves the Children — You Are Special',
      'Lesson 10 — The Miracles of Jesus — God Still Works Wonders',
      'Lesson 11 — The Cross and Resurrection — Jesus Is Alive!',
      'Lesson 12 — You Can Follow Jesus — Your Next Step',
    ],
    materials: [
      { lessonNumber: 1, title: 'Animated Video — The Creation Story for Kids', type: 'VIDEO' as MaterialType, onlineUrl: yt('2MD_eEBKXI0'), status: PUBLISHED },
      { lessonNumber: 1, title: 'Bible Story — Genesis 1:1-31 (God Made Everything)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Genesis+1%3A1-31&version=NIRV', status: PUBLISHED },
      { lessonNumber: 1, title: 'Activity — Draw What God Created on Each Day', type: 'ASSIGNMENT' as MaterialType, onlineUrl: 'https://ministry-to-children.com/creation-coloring-pages/', status: PUBLISHED },
      { lessonNumber: 2, title: 'Animated Video — Noah and the Ark for Children', type: 'VIDEO' as MaterialType, onlineUrl: yt('j7BoIR8TDdA'), status: PUBLISHED },
      { lessonNumber: 2, title: 'Bible Story — Genesis 6:9-22 and Genesis 9:8-17', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Genesis+6%3A9-22%2C+Genesis+9%3A8-17&version=NIRV', status: PUBLISHED },
      { lessonNumber: 3, title: 'Video — Abraham — Father of Faith', type: 'VIDEO' as MaterialType, onlineUrl: yt('xfWQFvyFaAk'), status: PUBLISHED },
      { lessonNumber: 3, title: 'Bible Story — Genesis 12:1-9 (God\'s Call to Abraham)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Genesis+12%3A1-9&version=NIRV', status: PUBLISHED },
      { lessonNumber: 4, title: 'Animated Video — Joseph and His Brothers', type: 'VIDEO' as MaterialType, onlineUrl: yt('SBkBb03fODg'), status: PUBLISHED },
      { lessonNumber: 4, title: 'Bible Story — Genesis 37:1-28 (Joseph\'s Journey)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Genesis+37%3A1-28&version=NIRV', status: PUBLISHED },
      { lessonNumber: 4, title: 'Activity — Color Joseph\'s Amazing Coat', type: 'ASSIGNMENT' as MaterialType, onlineUrl: 'https://ministry-to-children.com/joseph-coloring-page/', status: PUBLISHED },
      { lessonNumber: 5, title: 'Animated Video — Moses and the Exodus for Kids', type: 'VIDEO' as MaterialType, onlineUrl: yt('uGGSyTpIwFo'), status: PUBLISHED },
      { lessonNumber: 5, title: 'Bible Story — Exodus 3:1-17 (Moses and the Burning Bush)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Exodus+3%3A1-17&version=NIRV', status: PUBLISHED },
      { lessonNumber: 6, title: 'Animated Video — David and Goliath', type: 'VIDEO' as MaterialType, onlineUrl: yt('6JCEJeEWNiI'), status: PUBLISHED },
      { lessonNumber: 6, title: 'Bible Story — 1 Samuel 17:32-50 (The Battle)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=1+Samuel+17%3A32-50&version=NIRV', status: PUBLISHED },
      { lessonNumber: 6, title: 'Memory Verse — Philippians 4:13 (I Can Do All Things)', type: 'DOCUMENT' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Philippians+4%3A13&version=NIRV', status: PUBLISHED },
      { lessonNumber: 7, title: 'Animated Video — Daniel in the Lions\' Den', type: 'VIDEO' as MaterialType, onlineUrl: yt('f8PAEk8ADbc'), status: PUBLISHED },
      { lessonNumber: 7, title: 'Bible Story — Daniel 6:1-23 (Daniel and the Lions)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Daniel+6%3A1-23&version=NIRV', status: PUBLISHED },
      { lessonNumber: 8, title: 'Animated Video — The Christmas Story for Kids', type: 'VIDEO' as MaterialType, onlineUrl: yt('bkdB3RQDM50'), status: PUBLISHED },
      { lessonNumber: 8, title: 'Bible Story — Luke 2:1-20 (The Birth of Jesus)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Luke+2%3A1-20&version=NIRV', status: PUBLISHED },
      { lessonNumber: 9, title: 'Video — Jesus Loves the Little Children Song & Story', type: 'VIDEO' as MaterialType, onlineUrl: yt('o_GtZ9e9V9c'), status: PUBLISHED },
      { lessonNumber: 9, title: 'Bible Story — Mark 10:13-16 (Jesus and the Children)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Mark+10%3A13-16&version=NIRV', status: PUBLISHED },
      { lessonNumber: 10, title: 'Animated Video — Miracles of Jesus for Kids', type: 'VIDEO' as MaterialType, onlineUrl: yt('9B-M1P4W2ho'), status: PUBLISHED },
      { lessonNumber: 11, title: 'Animated Video — The Easter Story for Children', type: 'VIDEO' as MaterialType, onlineUrl: yt('JQ2spcAf5Dg'), status: PUBLISHED },
      { lessonNumber: 11, title: 'Bible Story — Luke 24:1-12 (Jesus Is Risen!)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Luke+24%3A1-12&version=NIRV', status: PUBLISHED },
      { lessonNumber: 12, title: 'Video — Following Jesus — A Prayer for Children', type: 'VIDEO' as MaterialType, onlineUrl: yt('t9FbSBqvOeE'), status: PUBLISHED },
      { lessonNumber: 12, title: 'Quiz — Heroes of Faith Quiz for Kids', type: 'QUIZ' as MaterialType, onlineUrl: 'https://www.biblegateway.com/resources/all-women-bible/children', status: PUBLISHED },
      { lessonNumber: 12, title: 'Online Class — Children\'s Live Bible Story Session', type: 'ONLINE_MEETING' as MaterialType, onlineUrl: 'https://meet.google.com/', status: PUBLISHED },
    ],
  });

  /* ═══════════════════════════════════════════════════════════════════════
     COURSE 4 — ADVANCED (NORMAL_DAY_TO_DAY)
     Target: Members and Worshipers
     ═══════════════════════════════════════════════════════════════════════ */
  if (!seedAdvancedCourse) {
    const advancedCourse = await prisma.course.findFirst({
      where: { title: 'Advanced Bible Study — Knowing God Deeper', instructorId: instructor.id },
      select: { id: true },
    });
    if (advancedCourse) {
      await prisma.course.update({ where: { id: advancedCourse.id }, data: { status: 'ARCHIVED' } });
    }
  }

  if (seedAdvancedCourse) {
  await upsertCourse(instructor.id, reviewer.id, {
    title:       'Advanced Bible Study — Knowing God Deeper',
    category:    'NORMAL_DAY_TO_DAY' as CourseCategory,
    description: `This advanced course is for active members and worshipers who want to deepen their biblical knowledge and spiritual maturity. It covers deep theological topics, systematic Bible study, Christian leadership, and practical discipleship.

Through in-depth video teaching, extensive Bible reading, and challenging assignments, you will grow into a mature disciple of Jesus Christ, ready to serve and lead in the church and community.`,
    duration:     '12 weeks · 3 sessions per week',
    targetAudience: 'MEMBERS_AND_WORSHIPERS' as any,
    objectives: `• Study the Bible systematically from Genesis to Revelation
• Understand the major theological doctrines of the Christian faith
• Develop skills for personal and group Bible study
• Learn Christian leadership principles from Scripture
• Understand the Holy Spirit and spiritual gifts
• Study prophetic books and end-times theology
• Grow in discipleship and mentoring others
• Develop a strong Christian worldview`,
    lessons: [
      'Lesson 1 — Survey of the Old Testament: From Creation to Covenant',
      'Lesson 2 — The Psalms: Songs of Praise, Lament, and Trust',
      'Lesson 3 — The Prophets: Hearing God\'s Voice in Every Age',
      'Lesson 4 — Survey of the New Testament: The Gospels',
      'Lesson 5 — The Epistles of Paul: Theology and Church Life',
      'Lesson 6 — The Holy Spirit: Who He Is and How He Works',
      'Lesson 7 — Spiritual Gifts: Discovering and Using Your Gift',
      'Lesson 8 — Christian Leadership: Servant Leadership in the Bible',
      'Lesson 9 — Prayer and Fasting: Deepening Your Spiritual Life',
      'Lesson 10 — Discipleship: Making and Being a Disciple',
      'Lesson 11 — Eschatology: Understanding End-Times Prophecy',
      'Lesson 12 — Living the Word: Applying Scripture Daily',
    ],
    materials: [
      { lessonNumber: 1, title: 'Video — Overview of the Old Testament', type: 'VIDEO' as MaterialType, onlineUrl: yt('ALsluAKBZ-c'), status: PUBLISHED },
      { lessonNumber: 1, title: 'Video — The Story of God and the World (BibleProject)', type: 'VIDEO' as MaterialType, onlineUrl: yt('7_CGP-12AE0'), status: PUBLISHED },
      { lessonNumber: 1, title: 'Bible Reading — Genesis Overview and Covenant Promises', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Genesis+1-3%2C+12%2C+15%2C+17&version=NIV', status: PUBLISHED },
      { lessonNumber: 1, title: 'Study Notes — The Covenants of the Bible', type: 'DOCUMENT' as MaterialType, onlineUrl: 'https://www.gotquestions.org/Bible-covenants.html', status: PUBLISHED },
      { lessonNumber: 2, title: 'Video — How to Study the Psalms (BibleProject)', type: 'VIDEO' as MaterialType, onlineUrl: yt('j9phNEaPrv8'), status: PUBLISHED },
      { lessonNumber: 2, title: 'Bible Reading — Psalm 22, 23, 51, 91, 119 (Key Psalms)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Psalm+22%2C+23%2C+51%2C+91%2C+119%3A1-32&version=NIV', status: PUBLISHED },
      { lessonNumber: 2, title: 'Assignment — Write a Personal Psalm of Praise', type: 'ASSIGNMENT' as MaterialType, onlineUrl: 'https://www.crosswalk.com/faith/prayer/writing-your-own-psalm.html', status: PUBLISHED },
      { lessonNumber: 3, title: 'Video — The Major and Minor Prophets Explained', type: 'VIDEO' as MaterialType, onlineUrl: yt('dk-tYsBL6eM'), status: PUBLISHED },
      { lessonNumber: 3, title: 'Video — Isaiah Book Overview (BibleProject)', type: 'VIDEO' as MaterialType, onlineUrl: yt('d2EMRkoF8ZA'), status: PUBLISHED },
      { lessonNumber: 3, title: 'Bible Reading — Isaiah 53 and Jeremiah 29:11-13', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Isaiah+53%2C+Jeremiah+29%3A11-13&version=NIV', status: PUBLISHED },
      { lessonNumber: 4, title: 'Video — Overview of the Four Gospels (BibleProject)', type: 'VIDEO' as MaterialType, onlineUrl: yt('NvLLgQ4E7NY'), status: PUBLISHED },
      { lessonNumber: 4, title: 'Video — The Gospel of John Book Overview', type: 'VIDEO' as MaterialType, onlineUrl: yt('G-2e9mMf7E8'), status: PUBLISHED },
      { lessonNumber: 4, title: 'Bible Reading — John 14-17 (The Upper Room Discourse)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=John+14-17&version=NIV', status: PUBLISHED },
      { lessonNumber: 5, title: 'Video — Romans Book Overview (BibleProject)', type: 'VIDEO' as MaterialType, onlineUrl: yt('ej_6dVdAnAI'), status: PUBLISHED },
      { lessonNumber: 5, title: 'Video — Ephesians Book Overview (BibleProject)', type: 'VIDEO' as MaterialType, onlineUrl: yt('Y71r-T98E2Q'), status: PUBLISHED },
      { lessonNumber: 5, title: 'Bible Reading — Romans 8 and Ephesians 1-3', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Romans+8%2C+Ephesians+1-3&version=NIV', status: PUBLISHED },
      { lessonNumber: 5, title: 'Assignment — Personal Theology Essay: What I Believe', type: 'ASSIGNMENT' as MaterialType, onlineUrl: 'https://www.thegospelcoalition.org/essay/systematic-theology/', status: PUBLISHED },
      { lessonNumber: 6, title: 'Video — Who Is the Holy Spirit? (BibleProject)', type: 'VIDEO' as MaterialType, onlineUrl: yt('oNNZO9i1Gjc'), status: PUBLISHED },
      { lessonNumber: 6, title: 'Video — The Holy Spirit in Acts', type: 'VIDEO' as MaterialType, onlineUrl: yt('cgUim6j2qIk'), status: PUBLISHED },
      { lessonNumber: 6, title: 'Bible Reading — Acts 2:1-21 and 1 Corinthians 12:1-11', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Acts+2%3A1-21%2C+1+Corinthians+12%3A1-11&version=NIV', status: PUBLISHED },
      { lessonNumber: 7, title: 'Video — Spiritual Gifts: Discovering Your Gift', type: 'VIDEO' as MaterialType, onlineUrl: yt('JhAzGobEYrU'), status: PUBLISHED },
      { lessonNumber: 7, title: 'Bible Reading — Romans 12:3-8 and 1 Peter 4:10-11', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Romans+12%3A3-8%2C+1+Peter+4%3A10-11&version=NIV', status: PUBLISHED },
      { lessonNumber: 7, title: 'Quiz — Spiritual Gifts Assessment', type: 'QUIZ' as MaterialType, onlineUrl: 'https://spiritualgiftsfinder.com/', status: PUBLISHED },
      { lessonNumber: 8, title: 'Video — Servant Leadership — Jesus\' Model for Leaders', type: 'VIDEO' as MaterialType, onlineUrl: yt('kgfCjHuAXHQ'), status: PUBLISHED },
      { lessonNumber: 8, title: 'Bible Reading — Mark 10:35-45 and John 13:1-17', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Mark+10%3A35-45%2C+John+13%3A1-17&version=NIV', status: PUBLISHED },
      { lessonNumber: 8, title: 'Assignment — Write a Personal Leadership Vision Statement', type: 'ASSIGNMENT' as MaterialType, onlineUrl: 'https://www.christianitytoday.com/leaders/', status: PUBLISHED },
      { lessonNumber: 9, title: 'Video — Fasting and Prayer — A Biblical Guide', type: 'VIDEO' as MaterialType, onlineUrl: yt('5MfL7SNHRBY'), status: PUBLISHED },
      { lessonNumber: 9, title: 'Bible Reading — Matthew 6:16-18 and Daniel 9:1-19', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Matthew+6%3A16-18%2C+Daniel+9%3A1-19&version=NIV', status: PUBLISHED },
      { lessonNumber: 10, title: 'Video — The Great Commission — Making Disciples', type: 'VIDEO' as MaterialType, onlineUrl: yt('wV8EoVSGN-A'), status: PUBLISHED },
      { lessonNumber: 10, title: 'Bible Reading — Matthew 28:16-20 and 2 Timothy 2:1-2', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Matthew+28%3A16-20%2C+2+Timothy+2%3A1-2&version=NIV', status: PUBLISHED },
      { lessonNumber: 11, title: 'Video — Revelation and End Times Overview (BibleProject)', type: 'VIDEO' as MaterialType, onlineUrl: yt('1M7GBKXBWoc'), status: PUBLISHED },
      { lessonNumber: 11, title: 'Bible Reading — Revelation 1, 21-22 (Beginning and End)', type: 'PDF_BOOK' as MaterialType, onlineUrl: 'https://www.biblegateway.com/passage/?search=Revelation+1%2C+21-22&version=NIV', status: PUBLISHED },
      { lessonNumber: 12, title: 'Video — Applying God\'s Word in Daily Life', type: 'VIDEO' as MaterialType, onlineUrl: yt('0vGmVrfCb5Y'), status: PUBLISHED },
      { lessonNumber: 12, title: 'Final Quiz — Advanced Bible Course Comprehensive Assessment', type: 'QUIZ' as MaterialType, onlineUrl: 'https://www.biblegateway.com/resources/all-women-bible/bible-study', status: PUBLISHED },
      { lessonNumber: 12, title: 'Online Graduation Session — Course Completion Ceremony', type: 'ONLINE_MEETING' as MaterialType, onlineUrl: 'https://meet.google.com/', status: PUBLISHED },
    ],
  });
  }

  console.log(`\n✅ ${seedAdvancedCourse ? 'All 4 courses' : '3 courses'} seeded and published successfully!`);
  console.log('   Courses are immediately available to eligible users.');
}

/* ─── Upsert helper ────────────────────────────────────────────────────────── */
async function upsertCourse(
  instructorId: string,
  reviewerId:   string,
  data: {
    title:         string;
    category:      CourseCategory;
    description:   string;
    duration:      string;
    targetAudience: any;
    objectives:    string;
    lessons:       string[];
    minAge?:       number;
    maxAge?:       number;
    materials:     MatInput[];
  },
) {
  /* Skip if already exists */
  const existing = await prisma.course.findFirst({
    where: { title: data.title, instructorId },
  });

  let course;
  if (existing) {
    console.log(`  ⚠  Course already exists — updating: "${data.title}"`);
    course = await prisma.course.update({
      where: { id: existing.id },
      data: {
        description:    data.description,
        duration:       data.duration,
        objectives:     data.objectives,
        lessons:        data.lessons,
        targetAudience: data.targetAudience,
        minAge:         data.minAge ?? null,
        maxAge:         data.maxAge ?? null,
        status:         PUBLISHED,
        reviewerId,
        reviewedAt:     new Date(),
        publishedAt:    new Date(),
      },
    });
  } else {
    course = await prisma.course.create({
      data: {
        title:          data.title,
        category:       data.category,
        description:    data.description,
        duration:       data.duration,
        objectives:     data.objectives,
        lessons:        data.lessons,
        targetAudience: data.targetAudience,
        minAge:         data.minAge ?? null,
        maxAge:         data.maxAge ?? null,
        status:         PUBLISHED,
        instructorId,
        reviewerId,
        reviewedAt:     new Date(),
        publishedAt:    new Date(),
      },
    });
    console.log(`  ✓  Created course: "${data.title}"`);
  }

  /* Delete old materials and re-seed fresh */
  await prisma.courseMaterial.deleteMany({ where: { courseId: course.id } });

  const mats = await prisma.courseMaterial.createMany({
    data: data.materials.filter(m => m.lessonNumber == null || m.lessonNumber <= data.lessons.length).map(m => ({
      courseId:     course.id,
      instructorId,
      reviewerId,
      lessonNumber: m.lessonNumber ?? null,
      title:        m.title,
      type:         m.type,
      fileUrl:      m.fileUrl ?? null,
      onlineUrl:    m.onlineUrl ?? null,
      status:       m.status,
      reviewedAt:   new Date(),
    })),
  });

  console.log(`     → ${mats.count} materials added`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
