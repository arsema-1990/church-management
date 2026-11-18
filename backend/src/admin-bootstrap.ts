import bcrypt from 'bcrypt';
import { UserRole, type Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export type AdminBootstrapConfig = {
  email: string;
  username: string;
  password: string;
};

export function getAdminBootstrapConfig(env: NodeJS.ProcessEnv): AdminBootstrapConfig | null {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const username = env.ADMIN_USERNAME?.trim();
  const password = env.ADMIN_PASSWORD?.trim();

  if (!email || !username || !password) {
    return null;
  }

  if (password.length < 12) {
    return null;
  }

  return { email, username, password };
}

export function shouldRecreateAdmin(
  existing: { role: string | null; email: string; username: string } | null,
  config: AdminBootstrapConfig,
): boolean {
  if (!existing) return true;
  if (existing.email.toLowerCase() !== config.email || existing.username !== config.username) return false;
  return existing.role !== UserRole.ADMINISTRATOR;
}

export async function shouldRefreshAdminCredentials(
  existing: { role: string | null; passwordHash: string } | null,
  config: AdminBootstrapConfig,
): Promise<boolean> {
  if (!existing) return false;
  if (existing.role !== UserRole.ADMINISTRATOR) return false;
  return !(await bcrypt.compare(config.password, existing.passwordHash));
}

export async function ensureDefaultAdmin(): Promise<{ created: boolean; updated: boolean; reason: string }> {
  const config = getAdminBootstrapConfig(process.env);
  if (!config) {
    return { created: false, updated: false, reason: 'Admin bootstrap is not configured in backend/.env.' };
  }

  try {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: config.email }, { username: config.username }],
      },
      select: { id: true, email: true, username: true, role: true, passwordHash: true },
    });

    if (existing) {
      const needsRoleUpgrade = existing.role !== UserRole.ADMINISTRATOR;
      const needsPasswordRefresh = await shouldRefreshAdminCredentials(existing, config);

      if (needsRoleUpgrade || needsPasswordRefresh) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            role: UserRole.ADMINISTRATOR,
            isActive: true,
            mustChangePassword: false,
            ...(needsPasswordRefresh ? { passwordHash: await bcrypt.hash(config.password, 12) } : {}),
          },
        });

        if (needsRoleUpgrade && needsPasswordRefresh) {
          return { created: false, updated: true, reason: 'Existing admin account was repaired and password synchronized to the configured credentials.' };
        }
        if (needsRoleUpgrade) {
          return { created: false, updated: true, reason: 'Existing user was promoted to administrator.' };
        }
        return { created: false, updated: true, reason: 'The stored admin password was refreshed to match the configured credentials.' };
      }

      return { created: false, updated: false, reason: 'The default administrator already exists.' };
    }

    const passwordHash = await bcrypt.hash(config.password, 12);
    await prisma.user.create({
      data: {
        email: config.email,
        username: config.username,
        passwordHash,
        role: UserRole.ADMINISTRATOR,
        isActive: true,
        mustChangePassword: false,
      },
    });

    const churchCount = await prisma.church.count();
    if (churchCount === 0) {
      await prisma.church.create({
        data: {
          name: 'Grace Evangelical Church',
          motto: 'Together in faith · Grow · Serve',
        },
      });
    }

    return { created: true, updated: false, reason: 'The default administrator account was created.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Admin bootstrap] Could not create or validate the default admin account: ${message}`);
    return { created: false, updated: false, reason: 'Database is unavailable or not initialized yet.' };
  }
}
