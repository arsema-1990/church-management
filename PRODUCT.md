# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **New Worshipers:** Seekers and newcomers seeking faith guidance, enrolling in the Beginner Foundation course, and exploring church membership.
- **Church Members:** Baptized believers actively participating in Home Cells, enrolled in household discipleship courses, and holding verifiable baptism/course certificates.
- **Home Cell Leaders:** Servant leaders facilitating weekly small-group fellowships, tracking attendance, and providing direct pastoral care.
- **Class Instructors:** Ministry teachers authoring courses, attaching video lessons, study scriptures, and evaluating student progress.
- **Church Managers & Administrators:** Pastoral executives governing church operations, validating membership, assigning cell leaders, and issuing verified certificates.

## Product Purpose
To provide Grace Evangelical Church with an end-to-end digital ecosystem that shepherds individuals from first-time worshipers into mature, baptized disciples and active Home Cell community members, supported by verifiable credentialing and bilingual administrative governance.

## Positioning
Unlike generic church database software or corporate learning systems, this platform unites pastoral discipleship tracking (onboarding, structured course sequences, and automated cryptographically verifiable QR certificates) with native Ethiopian church structures (Home Cells / የቤት ህብረት) and first-class Amharic (Ethiopic) localization.

## Operating Context
- Responsive web app across desktop and mobile browsers used by congregants at home and during worship services.
- Hybrid local/diaspora church environment where family members and youth transition between Amharic and English.
- Integrated digital learning environment pairing YouTube teaching video segments, scripture readings, and downloadable PDF study guides with lesson progress tracking.
- Secure, paperless certification workflow with real-time public QR code verification for baptism and course completions.

## Capabilities and Constraints
- **Capabilities:**
  - Role-based access control (Admin, Church Manager, Class Instructor, Member, Worshiper).
  - Multi-step worshiper registration with photo upload, testimony details, and baptism history.
  - Progressive course sequencing (Foundation of Faith -> Home Cell Household -> Advanced Bible Study -> Children's Bible).
  - Automatic certificate issuance upon 100% course completion with unique serials and QR codes.
  - Home Cell management with leader assignment, member rosters, and activity logs.
  - Direct messaging between worshipers and church leadership.
  - Bilingual localization engine (English / Amharic) with script-aware typography.
- **Constraints:**
  - Non-Docker local environment running native Windows PostgreSQL 17.
  - Zero-letter-spacing and relaxed line-height constraints required for Ethiopic Ge'ez script legibility.
  - Email dispatch dependent on configured external provider (EmailJS / Brevo / SMTP).

## Brand Commitments
- **Name:** Grace Evangelical Church
- **Motto / Tagline:** "Together in faith · Grow · Serve" / "Worship · Grow · Serve"
- **Identity Palette:** Deep Navy (`#0a1628`), Ivory White (`#ffffff`), Warm Gold Accent (`#d4af37`), Soft Sky Blue (`#dce8f5`).
- **Typography & Tone:** Dignified, reverent, pastoral, welcoming, and clear. Zero generic "AI-slop" SaaS decorations.
- **Scripture Anchor:** Romans 12:5 and Matthew 18:20.

## Evidence on Hand
- Full database schema with PostgreSQL/Prisma models (`User`, `Person`, `Course`, `Certificate`, `HomeCell`, `PortalRequest`).
- 4 comprehensive published seed courses with structured lessons, video links, Bible passages, and assignments.
- Complete localization catalogs (`frontend/src/i18n/locales/en.json` and `am.json`).
- Verified cryptographic certificate generator (`backend/src/services/certificates.ts`).

## Product Principles
1. **Discipleship Over Administration:** The core journey is spiritual transformation; administrative tracking exists to serve the believer's growth from seeker to servant leader.
2. **First-Class Bilingual Dignity:** Amharic and English are equal citizens in UI spacing, typography, and messaging without awkward clipping or machine-translated artifacts.
3. **Transparent & Verifiable Credentialing:** Church achievements (Baptism, Course Completion) carry durable, cryptographically verifiable records that respect members' spiritual milestones.
4. **Community in the Small (Home Cells):** Spiritual growth happens in circles, not just rows; Home Cell structures receive priority attention alongside whole-church management.

## Accessibility & Inclusion
- Full Ethiopic script readability: zero negative letter-spacing, adequate line-height (1.35–1.6), and system Ethiopic font fallbacks (`Noto Sans Ethiopic`, `Nyala`).
- High-contrast text compliance for elderly and mobile congregants in both light and dark portal modes.
- Mobile-first responsiveness across multi-step registration forms, lesson video players, and certificate displays.
