import { rejectIfModuleDisabled } from '@/lib/require-module';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canUseScanner } from '@/lib/acl';

/** Approved events for scanner picker (today ± 1 day window) */
export async function GET() {
  {
    const blocked = await rejectIfModuleDisabled('tickets_scan');
    if (blocked) return blocked;
  }
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !canUseScanner(session.user.role, session.user.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const from = new Date(now.getTime() - 18 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 36 * 60 * 60 * 1000);

    const bookings = await prisma.booking.findMany({
      where: {
        status: 'APPROVED',
        startTime: { lte: to },
        endTime: { gte: from },
      },
      orderBy: { startTime: 'asc' },
      take: 40,
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        space: { select: { title: true } },
        _count: {
          select: {
            participants: true,
            checkIns: true,
          },
        },
      },
    });

    const events = bookings.map((b) => ({
      id: b.id,
      title: b.title,
      startTime: b.startTime,
      endTime: b.endTime,
      space: b.space,
      registeredCount: b._count.participants + 1,
      checkedCount: b._count.checkIns,
    }));

    return NextResponse.json({ events });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}
