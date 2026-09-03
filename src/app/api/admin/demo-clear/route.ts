import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    if (process.env.ALLOW_DEMO_SEED !== '1' && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { message: 'Очистка демо отключена на production. Установите ALLOW_DEMO_SEED=1 только на staging.' },
        { status: 403 }
      );
    }

    const session = await getServerSession(authOptions);
    // @ts-ignore
    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json({ message: 'Доступ запрещен' }, { status: 403 });
    }

    // Удаляем все записи с isDemoData: true
    await prisma.application.deleteMany({ where: { isDemoData: true } });
    await prisma.booking.deleteMany({ where: { isDemoData: true } });
    await prisma.project.deleteMany({ where: { isDemoData: true } });
    await prisma.club.deleteMany({ where: { isDemoData: true } });
    await prisma.space.deleteMany({ where: { isDemoData: true } });
    await prisma.portalProgram.deleteMany({ where: { isDemoData: true } });
    await prisma.news.deleteMany({ where: { isDemoData: true } });
    await prisma.user.deleteMany({ where: { isDemoData: true } });

    return NextResponse.json({ message: 'Все демо-данные очищены!' }, { status: 200 });
  } catch (error) {
    console.error('Ошибка очистки демо-режима:', error);
    return NextResponse.json({ message: 'Ошибка при удалении данных' }, { status: 500 });
  }
}
