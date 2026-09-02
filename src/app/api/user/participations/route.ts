import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildTicketCode } from '@/lib/tickets';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const participations = await prisma.bookingParticipant.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        booking: {
          include: {
            space: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 80,
    });

    const payload = participations.map((p) => ({
      ...p,
      ticketCode: buildTicketCode(p.bookingId, p.userId),
    }));

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[PARTICIPATIONS_GET]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
