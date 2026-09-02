import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildOtpAuthUrl, generateTotpSecret } from '@/lib/totp';
import { getSiteIdentity } from '@/lib/site-identity';
import { assertSameOrigin } from '@/lib/csrf-origin';

export const dynamic = 'force-dynamic';

/** Start 2FA setup: issue new secret (not enabled until verify). */
export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Требуется вход' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, phone: true, name: true, totpEnabled: true },
  });
  if (!user) {
    return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
  }
  if (user.totpEnabled) {
    return NextResponse.json({ message: '2FA уже включена. Сначала отключите.' }, { status: 400 });
  }

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: secret, totpEnabled: false },
  });

  const { siteName } = await getSiteIdentity();
  const account = user.email || user.phone || user.name || session.user.id;
  const otpauthUrl = buildOtpAuthUrl({
    secret,
    accountName: account,
    issuer: siteName || 'Молодёжь Сочи',
  });

  return NextResponse.json({
    ok: true,
    secret,
    otpauthUrl,
    message: 'Отсканируйте QR в приложении-аутентификаторе и подтвердите кодом.',
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Требуется вход' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpEnabled: true },
  });
  return NextResponse.json({
    totpEnabled: Boolean(user?.totpEnabled),
  });
}
