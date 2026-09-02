import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rejectIfModuleDisabled } from '@/lib/require-module';

export async function GET(req: Request) {
  try {
    const blocked = await rejectIfModuleDisabled('applications');
    if (blocked) return blocked;

    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const applications = await prisma.application.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        message: true,
        projectId: true,
        clubId: true,
        programId: true,
        project: { select: { id: true, title: true, status: true } },
        club: { select: { id: true, title: true, status: true } },
        program: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });

    return NextResponse.json(applications, { status: 200 });
  } catch (error) {
    console.error('Ошибка при получении заявок:', error);
    return NextResponse.json({ message: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
