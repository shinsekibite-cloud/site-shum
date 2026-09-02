import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { resetPasswordRateLimiter, rateLimitJson } from '@/lib/rateLimit';

const resetSchema = z.object({
  token: z.string().min(1, 'Отсутствует токен'),
  password: z
    .string()
    .min(10, 'Пароль должен быть минимум 10 символов')
    .max(100)
    .refine((p) => /[A-Za-zА-Яа-яЁё]/.test(p) && /\d/.test(p), {
      message: 'Пароль должен содержать буквы и цифры',
    }),
});

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    if (!(await resetPasswordRateLimiter.checkAsync(`reset:${ip}`))) {
      return NextResponse.json(
        rateLimitJson('Слишком много попыток. Подождите несколько минут.'),
        { status: 429 }
      );
    }

    const body = await req.json();
    const parseResult = resetSchema.safeParse(body);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues[0]?.message || 'Некорректные данные';
      return NextResponse.json({ message: errorMsg }, { status: 400 });
    }

    const { token, password } = parseResult.data;

    const verificationToken = await prisma.verificationToken.findFirst({
      where: { token },
    });

    if (!verificationToken) {
      return NextResponse.json({ message: 'Неверная или устаревшая ссылка' }, { status: 400 });
    }

    if (new Date() > verificationToken.expires) {
      await prisma.verificationToken.delete({ where: { token } }).catch(() => null);
      return NextResponse.json({ message: 'Срок действия ссылки истек' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: verificationToken.identifier, mode: 'insensitive' } },
      select: { id: true, deletedAt: true, blockedAt: true },
    });

    if (!user || user.deletedAt || user.blockedAt) {
      await prisma.verificationToken.delete({ where: { token } }).catch(() => null);
      return NextResponse.json({ message: 'Неверная или устаревшая ссылка' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
        tokenKeepAlive: null,
      },
    });

    await prisma.verificationToken.delete({ where: { token } }).catch(() => null);

    return NextResponse.json({ message: 'Пароль изменен' }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
