import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import {
  hasPermission,
  isEndUserRole,
  type ModeratorPermission,
} from '@/lib/acl-shared';
import { MODERATION_PENDING_MESSAGE } from '@/lib/account-moderation';

export * from '@/lib/acl-shared';

export class AclError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function getAclSession() {
  return getServerSession(authOptions);
}

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new AclError('Требуется вход', 401);
  return session;
}

/** Block SCANNER from end-user actions (book / apply / join) */
export async function requireEndUser() {
  const session = await requireUser();
  if (!isEndUserRole(session.user.role)) {
    throw new AclError('Сервисная учётка сканера не может выполнять это действие');
  }
  if (session.user.moderationPending) {
    throw new AclError(MODERATION_PENDING_MESSAGE, 403);
  }
  return session;
}

/** Portal admin APIs (/api/admin/*) — ADMIN only. TECH must use /ops, not admin APIs. */
export async function requireAdmin() {
  const session = await requireUser();
  if (session.user.role !== 'ADMIN') {
    throw new AclError('Только для администратора');
  }
  return session;
}

/** Users / settings / backup — full ADMIN, not limited. */
export async function requireSuperAdmin() {
  const session = await requireAdmin();
  const { isSuperAdmin } = await import('@/lib/acl-shared');
  if (!isSuperAdmin(session.user.role, session.user.permissions)) {
    throw new AclError('Только для суперадминистратора');
  }
  return session;
}

/** Technical ops APIs (/api/ops/*) */
export async function requireTech() {
  const session = await requireUser();
  if (session.user.role !== 'TECH') {
    throw new AclError('Только для техслужбы');
  }
  return session;
}

export async function requirePermission(needed: ModeratorPermission | ModeratorPermission[]) {
  const session = await requireUser();
  const role = session.user.role;
  if (hasPermission(role, session.user.permissions, needed)) {
    return session;
  }
  throw new AclError('Недостаточно прав');
}

/** Staff actions (e.g. messenger moderation) — ADMIN / MODERATOR / TECH */
export async function requireAdminOrModerator() {
  const session = await requireUser();
  const role = session.user.role;
  if (role !== 'ADMIN' && role !== 'MODERATOR' && role !== 'TECH') {
    throw new AclError('Доступ только для сотрудников');
  }
  return session;
}

/** Server Components: gate page before Prisma reads */
export async function requireAdminPage() {
  try {
    return await requireAdmin();
  } catch (e) {
    if (e instanceof AclError && e.status === 401) redirect('/login?callbackUrl=/admin');
    redirect('/admin');
  }
}

export async function requirePermissionPage(needed: ModeratorPermission | ModeratorPermission[]) {
  try {
    return await requirePermission(needed);
  } catch (e) {
    if (e instanceof AclError && e.status === 401) redirect('/login?callbackUrl=/admin');
    redirect('/admin');
  }
}

export function aclJsonError(e: unknown) {
  if (e instanceof AclError) {
    return Response.json({ message: e.message }, { status: e.status });
  }
  throw e;
}
