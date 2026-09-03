import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const bookings = await prisma.booking.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        title: true,
        status: true,
        startTime: true,
        endTime: true,
        createdAt: true,
        spaceId: true,
        space: { select: { id: true, title: true, address: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });

    return NextResponse.json(bookings, { status: 200 });
  } catch (error) {
    console.error('Ошибка при получении бронирований:', error);
    return NextResponse.json({ message: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
