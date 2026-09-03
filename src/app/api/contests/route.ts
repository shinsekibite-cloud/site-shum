import { rejectIfModuleDisabled } from '@/lib/require-module';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  {
    const blocked = await rejectIfModuleDisabled('contests');
    if (blocked) return blocked;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Войдите в аккаунт' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get('kind');
  const status = searchParams.get('status');
  const where: Record<string, unknown> = {
    status: status && ['OPEN', 'VOTING', 'CLOSED'].includes(status)
      ? status
      : { in: ['OPEN', 'VOTING', 'CLOSED'] },
  };
  if (kind === 'SUBMISSION' || kind === 'RAFFLE') where.kind = kind;

  const items = await prisma.contest.findMany({
    where,
    orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
    take: 60,
    include: {
      booking: { select: { id: true, title: true, startTime: true } },
      _count: { select: { submissions: true, raffleEntries: true, winners: true } },
    },
  });

  const mySubs = await prisma.contestSubmission.findMany({
    where: { userId: session.user.id },
    select: { contestId: true, status: true, id: true },
    take: 100,
  });
  const myByContest = Object.fromEntries(mySubs.map((s) => [s.contestId, s]));

  return NextResponse.json({
    items: items.map((c) => ({
      ...c,
      mine: myByContest[c.id] || null,
    })),
  });
}
