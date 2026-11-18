import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { emailVerificationAccessAllowed } from '../services/emailVerification.js';

const secret = () => process.env.JWT_SECRET ?? '';

export function signToken(userId: string, role: string) {
  if (secret().length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');
  return jwt.sign({ role }, secret(), { subject: userId, expiresIn: (process.env.JWT_EXPIRES_IN ?? '12h') as jwt.SignOptions['expiresIn'] });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    const decoded = jwt.verify(token, secret());
    if (typeof decoded === 'string' || !decoded.sub) return res.status(401).json({ error: 'Invalid session.' });
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, role: true, isActive: true, emailVerified: true },
    });
    if (!user?.isActive) return res.status(401).json({ error: 'This account is not active.' });
    if (!emailVerificationAccessAllowed(user.emailVerified)) {
      return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', error: 'Verify your email address before accessing this account.' });
    }
    req.auth = { userId: user.id, role: user.role };
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session is invalid or has expired.' });
  }
}
