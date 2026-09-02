import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rejectIfModuleDisabled } from '@/lib/require-module';

export async function GET(req: Request) {
  const blocked = await rejectIfModuleDisabled('notifications');
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const url = new URL(req.url);
  const lite = url.searchParams.get('lite') === '1';
  const take = lite ? 0 : Math.min(60, Math.max(1, Number(url.searchParams.get('take')) || 40));

  if (lite) {
    const unread = await prisma.userNotification.count({
      where: { userId, readAt: null },
    });
    return NextResponse.json(
      { items: [], unread, total: unread, hasMore: false, lite: true },
      { headers: { 'Cache-Control': 'private, max-age=15' } }
    );
  }

  const [items, unread, total] = await Promise.all([
    prisma.userNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
        meta: true,
      },
    }),
    prisma.userNotification.count({
      where: { userId, readAt: null },
    }),
    prisma.userNotification.count({ where: { userId } }),
  ]);

  return NextResponse.json(
    { items, unread, total, hasMore: total > items.length },
    { headers: { 'Cache-Control': 'private, max-age=10' } }
  );
}

export async function POST(req: Request) {
  const blocked = await rejectIfModuleDisabled('notifications');
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.all) {
    await prisma.userNotification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ message: 'id required' }, { status: 400 });

  await prisma.userNotification.updateMany({
    where: { id, userId: session.user.id },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

export const PATCH = POST;
