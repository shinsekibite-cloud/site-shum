import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyEmailRateLimiter, verifyEmailPerAddressLimiter, rateLimitJson } from '@/lib/rateLimit';
import { unlockAchievement } from '@/lib/award-achievements';
import {
  COOKIES_POLICY_VERSION,
  PRIVACY_POLICY_VERSION,
  RULES_POLICY_VERSION,
  buildConsentSignature,
} from '@/lib/consent';
import { generatePublicCode } from '@/lib/public-id';
import { attributeReferralOnSignup, ensureReferralCode } from '@/lib/referrals';

type PendingMeta = {
  privacyAccepted?: boolean;
  personalDataConsent?: boolean;
  birthDate?: string;
  referralCode?: string | null;
  fingerprint?: string | null;
  signupIp?: string | null;
};

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    if (!(await verifyEmailRateLimiter.checkAsync(ip))) {
      return NextResponse.json(
        rateLimitJson('Слишком много попыток. Попробуйте позже.'),
        { status: 429 }
      );
    }

    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ message: 'Email и код обязательны' }, { status: 400 });
    }

    const emailNorm = String(email).toLowerCase().trim();
    const codeNorm = String(code).trim();

    if (!(await verifyEmailPerAddressLimiter.checkAsync(`verify:${emailNorm}`))) {
      return NextResponse.json(
        rateLimitJson('Слишком много попыток для этого адреса. Попробуйте позже.'),
        { status: 429 }
      );
    }

    const pendingUser = await prisma.pendingUser.findFirst({
      where: { email: emailNorm, token: codeNorm },
    });

    if (!pendingUser) {
      return NextResponse.json({ message: 'Неверный код' }, { status: 400 });
    }

    if (new Date() > pendingUser.expires) {
      await prisma.pendingUser.delete({ where: { id: pendingUser.id } }).catch(() => null);
      return NextResponse.json({ message: 'Срок действия кода истёк. Зарегистрируйтесь снова.' }, { status: 400 });
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: pendingUser.email }, { phone: pendingUser.phone }],
      },
    });
    if (existing) {
      await prisma.pendingUser.delete({ where: { id: pendingUser.id } }).catch(() => null);
      return NextResponse.json({ message: 'Пользователь уже зарегистрирован' }, { status: 400 });
    }

    let meta: PendingMeta = {};
    try {
      meta = pendingUser.meta ? (JSON.parse(pendingUser.meta) as PendingMeta) : {};
    } catch {
      meta = {};
    }

    const now = new Date();
    const verifiedEmail = pendingUser.email;
    let birthDate: Date | null = null;
    if (meta.birthDate) {
      const d = new Date(meta.birthDate);
      if (!Number.isNaN(d.getTime())) birthDate = d;
    }

    let user;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        user = await prisma.user.create({
          data: {
            name: pendingUser.name,
            email: pendingUser.email,
            phone: pendingUser.phone,
            password: pendingUser.password,
            publicCode: generatePublicCode(),
            emailVerified: now,
            // Email OTP does not prove phone ownership.
            phoneVerified: null,
            birthDate,
            privacyAcceptedAt: now,
            privacyFirstAcceptedAt: now,
            privacyRefusedAt: null,
            privacyPolicyVersion: PRIVACY_POLICY_VERSION,
            cookiesAcceptedAt: now,
            cookiesPolicyVersion: COOKIES_POLICY_VERSION,
            rulesAcceptedAt: now,
            rulesPolicyVersion: RULES_POLICY_VERSION,
            privacySignature: buildConsentSignature({
              email: verifiedEmail,
              kind: 'privacy',
              version: PRIVACY_POLICY_VERSION,
              at: now,
            }),
            cookiesSignature: buildConsentSignature({
              email: verifiedEmail,
              kind: 'cookies',
              version: COOKIES_POLICY_VERSION,
              at: now,
            }),
            rulesSignature: buildConsentSignature({
              email: verifiedEmail,
              kind: 'rules',
              version: RULES_POLICY_VERSION,
              at: now,
            }),
          },
        });
        break;
      } catch (e: any) {
        if (e?.code === 'P2002' && attempt < 7) continue;
        throw e;
      }
    }
    if (!user) {
      return NextResponse.json({ message: 'Не удалось создать пользователя' }, { status: 500 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        privacySignature: buildConsentSignature({
          userId: user.id,
          email: verifiedEmail,
          kind: 'privacy',
          version: PRIVACY_POLICY_VERSION,
          at: now,
        }),
        cookiesSignature: buildConsentSignature({
          userId: user.id,
          email: verifiedEmail,
          kind: 'cookies',
          version: COOKIES_POLICY_VERSION,
          at: now,
        }),
        rulesSignature: buildConsentSignature({
          userId: user.id,
          email: verifiedEmail,
          kind: 'rules',
          version: RULES_POLICY_VERSION,
          at: now,
        }),
      },
    });

    await prisma.pendingUser.delete({ where: { id: pendingUser.id } });

    await unlockAchievement(user.id, 'FIRST_STEPS');
    await unlockAchievement(user.id, 'PRIVACY_OK');
    await unlockAchievement(user.id, 'RULES_OK');

    void ensureReferralCode(user.id).catch(() => null);
    void attributeReferralOnSignup({
      refereeId: user.id,
      code: meta.referralCode,
      ip: meta.signupIp || ip,
      fingerprint: meta.fingerprint,
    }).catch((e) => console.error('referral attribute', e));

    return NextResponse.json({ message: 'Успешно подтверждено' }, { status: 200 });
  } catch (error) {
    console.error('Ошибка при верификации:', error);
    return NextResponse.json({ message: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
