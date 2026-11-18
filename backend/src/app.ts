import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __appDirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__appDirname, '../.env') });
dotenv.config({ path: path.resolve(__appDirname, '../../.env') });
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes         from './routes/auth.js';
import worshiperRoutes    from './routes/worshipers.js';
import portalRoutes       from './routes/portal.js';
import courseRoutes       from './routes/courses.js';
import managerRoutes      from './routes/manager.js';
import instructorRoutes   from './routes/instructor.js';
import organizationRoutes from './routes/organization.js';
import memberRoutes       from './routes/members.js';
import messagesRoutes     from './routes/messages.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '2mb' }));
app.use(
  '/uploads',
  express.static(path.resolve('uploads'), { dotfiles: 'deny', index: false, fallthrough: false }),
);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'church-management-api' }));

app.use('/api/auth',         rateLimit({ windowMs: 15 * 60_000, limit: 50 }), authRoutes);
app.use('/api/worshipers',   worshiperRoutes);    // renamed from /api/people
app.use('/api/people',       worshiperRoutes);    // backward-compat alias
app.use('/api/portal',       portalRoutes);
app.use('/api/courses',      courseRoutes);
app.use('/api/manager',      managerRoutes);
app.use('/api/instructor',   instructorRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/members',      memberRoutes);
app.use('/api',              messagesRoutes);

app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const status =
    error && typeof error === 'object' && 'status' in error && typeof (error as { status: unknown }).status === 'number'
      ? (error as { status: number }).status
      : 500;
  res.status(status).json({
    error: status === 500 ? 'The request could not be completed.' : (error as Error).message,
  });
});
