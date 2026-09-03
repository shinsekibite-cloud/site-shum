import { prisma } from '@/lib/prisma';
import { createUserNotification } from '@/lib/security';

/** Bind MAX user id to a portal account (clears the id from others). */
export async function bindMaxUserIdToAccount(opts: {
  userId: string;
  maxUserId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const maxUserId = String(opts.maxUserId || '').replace(/[^\d]/g, '');
  if (!maxUserId) return { ok: false, message: 'Некорректный MAX ID' };

  const user = await prisma.user.findFirst({
    where: { id: opts.userId, deletedAt: null, blockedAt: null },
    select: { id: true },
  });
  if (!user) return { ok: false, message: 'Пользователь не найден' };

  await prisma.user.updateMany({
    where: { maxUserId, NOT: { id: user.id } },
    data: { maxUserId: null, maxLinkedAt: null },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { maxUserId, maxLinkedAt: new Date() },
  });

  await createUserNotification({
    userId: user.id,
    type: 'SYSTEM',
    title: 'MAX привязан',
    body: `Аккаунт связан с MAX ID ${maxUserId}. В боте доступны афиша и билеты.`,
    meta: { channel: 'max', href: '/dashboard/settings' },
  });

  return { ok: true };
}
