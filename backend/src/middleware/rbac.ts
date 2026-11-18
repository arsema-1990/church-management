import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';

export const allowRoles = (...roles: UserRole[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth || !roles.includes(req.auth.role)) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
  next();
};

export const managerRoles: UserRole[] = ['ADMINISTRATOR', 'CHURCH_MANAGER'];
// Certificate approval (issuance) is restricted to Administrator only
export const certRoles:    UserRole[] = ['ADMINISTRATOR'];
