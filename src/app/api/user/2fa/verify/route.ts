import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import bcrypt from 'bcrypt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyTotp } from '@/lib/totp';
import { assertSameOrigin } from '@/lib/csrf-origin';

export const dynamic = 'force-dynamic';

/** Verify TOTP during setup (enable) or disable with password + code. */
export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Требуется вход' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action === 'disable' ? 'disable' : 'enable';
  const code = String(body.code || body.token || '').trim();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true, totpEnabled: true, password: true },
  });
  if (!user) {
    return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
  }

  if (action === 'enable') {
    if (!user.totpSecret) {
      return NextResponse.json({ message: 'Сначала запустите настройку 2FA' }, { status: 400 });
    }
    if (!verifyTotp(user.totpSecret, code)) {
      return NextResponse.json({ message: 'Неверный код' }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: session.user.id },
      data: { totpEnabled: true },
    });
    return NextResponse.json({ ok: true, totpEnabled: true, message: '2FA включена' });
  }

  // disable
  if (!user.totpEnabled) {
    return NextResponse.json({ ok: true, totpEnabled: false, message: '2FA уже выключена' });
  }
  const password = String(body.password || '');
  if (!password || !user.password) {
    return NextResponse.json({ message: 'Введите пароль аккаунта' }, { status: 400 });
  }
  const okPass = await bcrypt.compare(password, user.password);
  if (!okPass) {
    return NextResponse.json({ message: 'Неверный пароль' }, { status: 400 });
  }
  if (!user.totpSecret || !verifyTotp(user.totpSecret, code)) {
    return NextResponse.json({ message: 'Неверный код 2FA' }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpEnabled: false, totpSecret: null },
  });
  return NextResponse.json({ ok: true, totpEnabled: false, message: '2FA отключена' });
}
