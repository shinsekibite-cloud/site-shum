import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createUserNotification } from '@/lib/security';
import { SOCIAL } from '@/lib/reputation';

function unauthorized() {
  return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });
}

/** Reset or adjust authority (reliability) / social score / warnCount (ADMIN). */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') return unauthorized();
    const { id } = await ctx.params;
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target || target.role === 'TECH') {
      return NextResponse.json({ message: 'Не найден' }, { status: 404 });
    }
    const body = await req.json().catch(() => ({}));

    const data: {
      reliabilityScore?: number;
      socialScore?: number;
      warnCount?: number;
      attendedCount?: number;
      noShowCount?: number;
    } = {};

    if (body.resetKarma === true) {
      data.reliabilityScore = 100;
      data.socialScore = SOCIAL.DEFAULT;
      data.warnCount = 0;
      data.attendedCount = 0;
      data.noShowCount = 0;
    } else {
      if (typeof body.reliabilityScore === 'number') {
        data.reliabilityScore = Math.max(0, Math.min(100, Math.round(body.reliabilityScore)));
      }
      if (typeof body.socialScore === 'number') {
        data.socialScore = Math.max(0, Math.min(100, Math.round(body.socialScore)));
      }
      if (typeof body.warnCount === 'number') {
        data.warnCount = Math.max(0, Math.min(999, Math.round(body.warnCount)));
      }
    }

    if (!Object.keys(data).length) {
      return NextResponse.json({ message: 'Нечего обновлять' }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        reliabilityScore: true,
        socialScore: true,
        warnCount: true,
        attendedCount: true,
        noShowCount: true,
      },
    });

    const note =
      typeof body.note === 'string' && body.note.trim()
        ? body.note.trim().slice(0, 300)
        : 'Администратор обновил авторитет / социальный рейтинг.';

    await createUserNotification({
      userId: id,
      type: 'SYSTEM',
      title: 'Рейтинги обновлены',
      body: note,
      meta: { href: '/dashboard', by: session.user.id },
    });

    return NextResponse.json({ ok: true, user });
  } catch (e) {
    console.error('PATCH karma', e);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}
