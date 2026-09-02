import { NextResponse } from 'next/server';
import { getAccessSettings } from '@/lib/access-settings';
import { consumeCaptchaToken } from '@/lib/captcha';
import { issueAuthTicket } from '@/lib/auth-ticket';
import { issueSmsOtp, nationalPhoneKey, smsProviderConfigured } from '@/lib/sms-otp';
import { loginRateLimiter, loginIpRateLimiter, rateLimitJson } from '@/lib/rateLimit';
import { requestClientIp } from '@/lib/request-ip';
import { assertSameOrigin } from '@/lib/csrf-origin';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const originBlock = assertSameOrigin(req);
  if (originBlock) return originBlock;

  const access = await getAccessSettings();
  if (!access.smsLoginEnabled) {
    return NextResponse.json({ message: 'Вход по SMS выключен в настройках' }, { status: 403 });
  }
  if (!smsProviderConfigured()) {
    return NextResponse.json({ message: 'SMS-провайдер не настроен' }, { status: 503 });
  }

  const ip = requestClientIp(req);
  if (!(await loginIpRateLimiter.checkAsync(`sms-ip:${ip}`))) {
    return NextResponse.json(rateLimitJson('Слишком много запросов SMS'), { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const phone = String(body.phone || body.login || '').trim();
  const phoneKey = nationalPhoneKey(phone);
  if (phoneKey.length !== 10) {
    return NextResponse.json({ message: 'Укажите телефон' }, { status: 400 });
  }
  if (!(await loginRateLimiter.checkAsync(`sms:${phoneKey}`))) {
    return NextResponse.json(rateLimitJson('Код уже отправляли. Подождите несколько минут.'), { status: 429 });
  }

  const cap = await consumeCaptchaToken(String(body.captchaToken || ''), String(body.website || ''));
  if (!cap.ok) {
    return NextResponse.json({ message: cap.message || 'Пройдите проверку' }, { status: 400 });
  }

  const rows = await prisma.$queryRaw<Array<{ id: string; blockedAt: Date | null }>>`
    SELECT id, "blockedAt"
    FROM "User"
    WHERE "deletedAt" IS NULL
      AND length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
      AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = ${phoneKey}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user || user.blockedAt) {
    return NextResponse.json({
      ok: true,
      message: 'Если номер зарегистрирован, код отправлен',
      authTicket: issueAuthTicket(phoneKey, 'sms'),
    });
  }

  const issued = await issueSmsOtp(phone);
  if (!issued.ok) {
    return NextResponse.json({ message: issued.message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Если номер зарегистрирован, код отправлен',
    authTicket: issueAuthTicket(phoneKey, 'sms'),
  });
}
