# Church Management System — React and Node edition

The modern application lives in `frontend/` and `backend/`. It uses React, TypeScript, Vite, React Router, Tailwind CSS, Axios, React Hook Form, and Zod on the client; Express, TypeScript, JWT, bcrypt, Prisma, and PostgreSQL on the server.

The existing PHP files are preserved as migration references. They are not part of the new app's run path. No PHP, MySQL, or Laravel service is needed to run the React/Node application.

## Start locally

Requirements: Node.js 20.19+ or 22.12+, npm, and Docker Desktop (or another PostgreSQL 15+ service).

1. Copy `backend/.env.example` to `backend/.env`, set a long random `JWT_SECRET`, and configure the database URL.
2. Start PostgreSQL with `docker compose up -d postgres`, or point `DATABASE_URL` in `backend/.env` to your PostgreSQL instance.
3. Install packages from the repository root with `npm install`.
4. Generate the Prisma client and apply checked-in schema migrations: `npm run db:generate`, then `npx prisma migrate deploy --schema backend/prisma/schema.prisma`.
5. Create the first administrator only after setting `ADMIN_EMAIL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` (12 or more characters) in `backend/.env`, then run `npm run db:seed`.
6. Run both services with `npm run dev`.

### Email delivery and verification

Public worshiper registration creates an unverified account and sends a six-digit email-verification code. The code expires after five minutes, is single-use, and must be verified before login or protected API access. Resending replaces the previous code, has a 60-second cooldown, and is limited per account and source IP.

For Gmail, configure these values in the backend environment file (never in frontend environment files):

```dotenv
EMAIL_PROVIDER="gmail"
GMAIL_USER="your-sending-account@gmail.com"
GMAIL_APP_PASSWORD="your-16-character-gmail-app-password"
```

Enable 2-Step Verification on the sending Google account, create an App Password in its Google Account security settings, and store that password only in `backend/.env`. Do not commit the file or paste credentials into source code. The repository ignores `.env` and `backend/.env`. Gmail SMTP uses normal TLS certificate validation and trusts Node's default and operating-system certificate authorities.

Alternatively, use Brevo with `EMAIL_PROVIDER="brevo"`, `BREVO_API_KEY`, and a verified `EMAIL_FROM` sender. The existing Brevo/Resend configuration can also continue to deliver password-reset codes. If email delivery fails during registration, the account remains unverified, the API reports the failure rather than claiming delivery, and the verification screen allows a later resend.

The migration `20261021_email_otp_verification` adds verification state and OTP tracking. Existing accounts and administrator-created staff accounts remain verified; public registrations explicitly begin unverified. Apply all pending migrations before starting the updated backend.

Run the backend automated suite, including the registration-to-verification HTTP integration test against the configured local PostgreSQL database, with `npm --workspace backend test`. Email sending in that automated test is mocked; it does not deliver a real message. No frontend lint or format scripts are currently defined; `npm run build` performs frontend and backend TypeScript checks and the production frontend build.

The Vite app is at `http://localhost:5173`; its `/api` requests proxy to Express on `http://localhost:4000`. The API health endpoint is `/api/health`.

## API and roles

All protected endpoints use `Authorization: Bearer <JWT>`. Public worshiper registration creates a worshiper account only. Administrators provision Church Manager and Instructor accounts using `POST /api/auth/users`; the public registration flow cannot grant privileged roles.

- `/api/auth`: register, login, current account, Administrator-provisioned users.
- `/api/people`, `/api/members`, `/api/organization`: people, member records, and church settings.
- `/api/portal`: profile, children, home cell, requests, certificates, notifications, QR verification.
- `/api/courses`: published courses filtered by role, course materials, and learner progress.
- `/api/instructor`: instructor dashboard, own course drafts, uploads, submission, feedback, notifications.
- `/api/manager`: dashboard counts, worshipers, members, home cells, request and course/material approvals, and actual baptism recording.

Approval rules remain server-enforced: instructors can only edit their own drafts/rejected courses; courses and materials stay private until manager approval; completing a published course automatically issues a course-specific certificate with the active Church Manager's saved signature; baptism requests need an approved course certificate; an approved baptism date does not create membership; a Church Manager or Administrator records the actual baptism before the existing person account is promoted and a Member record is created. Issued certificates snapshot the issuer's name and signature.

Eligible learners unlock published courses in the order shown in their course list. The next course opens only after completing the previous one; both course-detail and progress APIs enforce this sequence.

## Existing database migration

The PHP project references an existing 44-table MySQL database, but the repository does not contain that database's base DDL or data export. The new PostgreSQL Prisma schema models the workflows and entities visible in the checked-in application and its additive migrations. Because no reliable legacy schema/data export is present, do not point Prisma at the production database or treat `prisma migrate` as a data-preserving conversion. Import existing people, memberships, church structure, classes, and certificates into PostgreSQL with an explicit, reviewed ETL mapping before cutover.

The current scope includes the worshiper/member portal, manager and instructor approval workflows, people/members, home cells, course materials, certificates, children, notifications, and bilingual navigation. Unpopulated legacy module folders should be mapped from the actual live database and requirements before final production cutover.
