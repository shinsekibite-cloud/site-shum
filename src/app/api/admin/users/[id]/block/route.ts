import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdminPath, hasPermission } from '@/lib/acl-shared';
import { createUserNotification, recordLoginEvent } from '@/lib/security';
import { logAdminAction } from '@/lib/admin-audit';
import { formatBanReasons, parseReasonCodes } from '@/lib/ban-reasons';

async function requireBlockAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const role = session.user.role;
  const perms = session.user.permissions || '';
  if (role === 'ADMIN' || role === 'TECH') return session;
  if (role === 'MODERATOR' && hasPermission(role, perms, 'moderation')) return session;
  if (canAccessAdminPath(role, perms, '/admin/users')) return session;
  return null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireBlockAccess();
  if (!session) return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });
  const { id } = await ctx.params;
  const [user, history] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: { suspiciousFlag: true, blockedAt: true, blockedReason: true, role: true },
    }),
    prisma.userBlockEvent.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);
  if (!user || user.role === 'TECH') return NextResponse.json({ message: 'Не найден' }, { status: 404 });
  return NextResponse.json({
    suspiciousFlag: user.suspiciousFlag,
    blockedAt: user.blockedAt,
    blockedReason: user.blockedReason,
    history,
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireBlockAccess();
  if (!session) return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });
  const { id } = await ctx.params;
  const existing = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!existing || existing.role === 'TECH') {
    return NextResponse.json({ message: 'Не найден' }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body.suspiciousFlag !== 'boolean') {
    return NextResponse.json({ message: 'Некорректный запрос' }, { status: 400 });
  }
  await prisma.user.update({
    where: { id },
    data: { suspiciousFlag: body.suspiciousFlag },
  });
  await logAdminAction({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: body.suspiciousFlag ? 'USER_FLAG_SUSPICIOUS' : 'USER_UNFLAG_SUSPICIOUS',
    targetType: 'User',
    targetId: id,
  });
  return NextResponse.json({ ok: true, suspiciousFlag: body.suspiciousFlag });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireBlockAccess();
  if (!session) return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = body.action === 'unblock' ? 'unblock' : 'block';
  const reasonCodes = parseReasonCodes(body.reasonCodes);
  const comment =
    typeof body.comment === 'string'
      ? body.comment.trim().slice(0, 500)
      : typeof body.reason === 'string'
        ? body.reason.trim().slice(0, 500)
        : '';

  if (action === 'block' && reasonCodes.length === 0 && !comment) {
    return NextResponse.json(
      { message: 'Укажите причину блокировки (код или комментарий)' },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!target || target.role === 'TECH') {
    return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
  }

  const reasonText =
    action === 'block'
      ? formatBanReasons(reasonCodes, comment)
      : comment || 'Блокировка снята';

  if (action === 'block') {
    await prisma.user.update({
      where: { id },
      data: {
        blockedAt: new Date(),
        blockedReason: reasonText,
        tokenVersion: { increment: 1 },
        suspiciousFlag: true,
      },
    });
    await prisma.userBlockEvent.create({
      data: {
        userId: id,
        action: 'BLOCK',
        reasonsJson: JSON.stringify(reasonCodes),
        comment: comment || null,
        actorId: session.user.id,
        actorName: session.user.name || session.user.email || 'Модератор',
      },
    });
    await recordLoginEvent({ userId: id, kind: 'BLOCKED_ATTEMPT', success: false });
    await createUserNotification({
      userId: id,
      type: 'SECURITY',
      title: 'Аккаунт заблокирован',
      body: reasonText,
    });
  } else {
    await prisma.user.update({
      where: { id },
      data: { blockedAt: null, blockedReason: null },
    });
    await prisma.userBlockEvent.create({
      data: {
        userId: id,
        action: 'UNBLOCK',
        reasonsJson: JSON.stringify([]),
        comment: comment || null,
        actorId: session.user.id,
        actorName: session.user.name || session.user.email || 'Модератор',
      },
    });
    await createUserNotification({
      userId: id,
      type: 'SECURITY',
      title: 'Блокировка снята',
      body: comment || 'Доступ к порталу восстановлен.',
    });
  }

  await logAdminAction({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: action === 'block' ? 'USER_BLOCK' : 'USER_UNBLOCK',
    targetType: 'User',
    targetId: target.id,
    targetEmail: target.email,
    detail: {
      reasonCodes: action === 'block' ? reasonCodes : null,
      reason: action === 'block' ? reasonText : comment || null,
      targetName: target.name,
      targetRole: target.role,
    },
  });

  return NextResponse.json({ ok: true });
}
