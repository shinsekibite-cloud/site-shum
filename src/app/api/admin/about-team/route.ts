import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/acl-shared';
import { assertCleanText, ProfanityError } from '@/lib/censor';

function canManage(role?: string | null, permissions?: string | null) {
  if (role === 'ADMIN') return true;
  if (role === 'MODERATOR') return hasPermission(role, permissions, ['portfolios', 'pages']);
  return false;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!canManage(session.user.role, session.user.permissions as string)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const q = new URL(req.url).searchParams.get('q')?.trim() || '';
  if (q.length >= 2) {
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        blockedAt: null,
        role: { not: 'TECH' },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { nickname: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { publicCode: { contains: q.toUpperCase(), mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, nickname: true, image: true, city: true, publicCode: true },
      take: 12,
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ users });
  }

  const items = await prisma.aboutFeaturedUser.findMany({
    include: {
      user: {
        select: { id: true, name: true, nickname: true, image: true, publicCode: true, city: true },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });
  return NextResponse.json({ items });
}

const upsertSchema = z.object({
  userId: z.string().min(1),
  roleTitle: z.string().min(1).max(120),
  sortOrder: z.number().int().optional(),
  isVisible: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!canManage(session.user.role, session.user.permissions as string)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = upsertSchema.parse(await req.json());
    assertCleanText(data.roleTitle);
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
    }

    const maxSort = await prisma.aboutFeaturedUser.aggregate({ _max: { sortOrder: true } });
    const item = await prisma.aboutFeaturedUser.upsert({
      where: { userId: data.userId },
      create: {
        userId: data.userId,
        roleTitle: data.roleTitle.trim(),
        sortOrder: data.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        isVisible: data.isVisible !== false,
      },
      update: {
        roleTitle: data.roleTitle.trim(),
        ...(data.sortOrder != null ? { sortOrder: data.sortOrder } : {}),
        ...(data.isVisible != null ? { isVisible: data.isVisible } : {}),
      },
      include: {
        user: {
          select: { id: true, name: true, nickname: true, image: true, publicCode: true, city: true },
        },
      },
    });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof ProfanityError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Некорректные данные' }, { status: 400 });
    }
    console.error('POST about-team', error);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!canManage(session.user.role, session.user.permissions as string)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ message: 'id required' }, { status: 400 });
  await prisma.aboutFeaturedUser.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
