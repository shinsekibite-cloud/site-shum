import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { isPhoneLikeLogin, phoneNational10, normalizePhone } from '@/lib/phone';
import { issueTotpChallenge } from '@/lib/totp-challenge';
import { loginRateLimiter, rateLimitJson } from '@/lib/rateLimit';
import { consumeCaptchaToken } from '@/lib/captcha';

export const dynamic = 'force-dynamic';

async function findUser(loginRaw: string) {
  const raw = loginRaw.trim();
  if (!raw) return null;
  if (raw.includes('@') || !isPhoneLikeLogin(raw)) {
    return prisma.user.findFirst({
      where: { email: { equals: raw.toLowerCase(), mode: 'insensitive' } },
      select: {
        id: true,
        password: true,
        blockedAt: true,
        deletedAt: true,
        totpEnabled: true,
      },
    });
  }
  const national = phoneNational10(raw);
  if (national.length !== 10) return null;
  const rows = await prisma.$queryRaw<Array<{ id: string; password: string | null; blockedAt: Date | null; deletedAt: Date | null; totpEnabled: boolean }>>`
    SELECT id, password, "blockedAt", "deletedAt", "totpEnabled"
    FROM "User"
    WHERE length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
      AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = ${national}
    LIMIT 1
  `;
  return rows[0] || null;
}

/** Password check → { needs2fa, challengeToken } without creating a session. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const loginRaw = String(body.email || body.login || '').trim();
  const password = String(body.password || '');
  if (!loginRaw || !password) {
    return NextResponse.json({ message: 'Неверные данные' }, { status: 400 });
  }

  const loginValue = isPhoneLikeLogin(loginRaw) ? normalizePhone(loginRaw) : loginRaw;
  const rateKey = isPhoneLikeLogin(loginValue)
    ? `login2fa:phone:${phoneNational10(loginValue)}`
    : `login2fa:${loginValue.toLowerCase()}`;
  if (!(await loginRateLimiter.checkAsync(rateKey))) {
    return NextResponse.json(rateLimitJson('Слишком много попыток'), { status: 429 });
  }

  const cap = await consumeCaptchaToken(String(body.captchaToken || ''), String(body.website || ''));
  if (!cap.ok) {
    return NextResponse.json({ message: cap.message || 'Пройдите проверку' }, { status: 400 });
  }

  const user = await findUser(loginValue);
  if (!user?.password) {
    return NextResponse.json({ message: 'Неверный логин или пароль' }, { status: 401 });
  }
  if (user.blockedAt) {
    return NextResponse.json({ message: 'Аккаунт заблокирован' }, { status: 403 });
  }
  if (user.deletedAt) {
    return NextResponse.json({ message: 'Аккаунт удалён' }, { status: 403 });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return NextResponse.json({ message: 'Неверный логин или пароль' }, { status: 401 });
  }

  if (user.totpEnabled) {
    return NextResponse.json({
      needs2fa: true,
      challengeToken: issueTotpChallenge(user.id),
    });
  }

  const { issueAuthTicket } = await import('@/lib/auth-ticket');
  const ticketLogin = isPhoneLikeLogin(loginValue) ? phoneNational10(loginValue) : loginValue;
  return NextResponse.json({
    needs2fa: false,
    authTicket: issueAuthTicket(ticketLogin || loginValue, 'login'),
  });
}
