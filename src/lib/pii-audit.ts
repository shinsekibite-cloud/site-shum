/**
 * Audit trail for access to personal data (admin/tech/self).
 */
import { prisma } from '@/lib/prisma';
import { logAdminAction } from '@/lib/admin-audit';

export async function logPiiAccess(opts: {
  actorId: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  targetUserId: string;
  fields: string[];
  reason: string;
  ip?: string | null;
}) {
  const detail = {
    targetUserId: opts.targetUserId,
    fields: opts.fields.slice(0, 20),
    reason: opts.reason.slice(0, 200),
    ip: opts.ip || null,
  };
  const role = opts.actorRole || '';
  if (role === 'ADMIN' || role === 'TECH' || role === 'MODERATOR') {
    await logAdminAction({
      actorId: opts.actorId,
      actorEmail: opts.actorEmail || undefined,
      actorRole: role,
      action: 'PII_ACCESS',
      targetType: 'User',
      targetId: opts.targetUserId,
      detail,
      ip: opts.ip,
    });
    return;
  }
  try {
    await prisma.userActionLog.create({
      data: {
        userId: opts.actorId,
        action: 'PII_ACCESS',
        category: 'privacy',
        targetType: 'User',
        targetId: opts.targetUserId,
        summary: opts.reason.slice(0, 200),
        detail: JSON.stringify(detail).slice(0, 1500),
        ip: opts.ip || null,
      },
    });
  } catch (e) {
    console.warn('[pii-audit]', e);
  }
}
