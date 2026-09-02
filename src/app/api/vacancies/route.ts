import { rejectIfModuleDisabled } from '@/lib/require-module';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** Open vacancies — members only */
export async function GET(req: Request) {
  {
    const blocked = await rejectIfModuleDisabled('vacancies');
    if (blocked) return blocked;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Войдите в аккаунт' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const format = (searchParams.get('format') || '').trim();
  const city = (searchParams.get('city') || '').trim();
  const scope = (searchParams.get('scope') || '').trim();

  const where: Record<string, unknown> = {
    status: 'OPEN',
    employer: { status: 'APPROVED' },
  };
  if (format && ['offline', 'hybrid', 'remote'].includes(format)) {
    where.workFormat = format;
  }
  if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }
  if (scope === 'internal') {
    where.employer = { status: 'APPROVED', isInternal: true };
  } else if (scope === 'partner') {
    where.employer = { status: 'APPROVED', isInternal: false };
  }
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
    ];
  }

  const items = await prisma.vacancy.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: 60,
    include: {
      employer: { select: { id: true, title: true, isInternal: true } },
      _count: {
        select: {
          questions: true,
          applications: { where: { status: 'APPROVED' } },
        },
      },
    },
  });

  const myApps = await prisma.vacancyApplication.findMany({
    where: { userId: session.user.id },
    select: { vacancyId: true, status: true, autoScore: true, id: true },
    take: 100,
  });
  const mine = Object.fromEntries(myApps.map((a) => [a.vacancyId, a]));

  const cities = await prisma.vacancy.findMany({
    where: { status: 'OPEN', employer: { status: 'APPROVED' }, city: { not: null } },
    select: { city: true },
    distinct: ['city'],
    take: 40,
  });

  return NextResponse.json({
    items: items.map((v) => ({
      id: v.id,
      title: v.title,
      city: v.city,
      workFormat: v.workFormat,
      closesAt: v.closesAt,
      seats: v.seats,
      seatsTaken: v._count.applications,
      employer: v.employer,
      _count: { questions: v._count.questions },
      mine: mine[v.id] || null,
    })),
    cities: cities.map((c) => c.city).filter(Boolean) as string[],
  });
}
