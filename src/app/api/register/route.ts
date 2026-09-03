import crypto from 'crypto';
import { rejectIfModuleDisabled } from '@/lib/require-module';
import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { registerRateLimiter, rateLimitJson } from '@/lib/rateLimit';
import { profanityResponse } from '@/lib/censor';
import { nameGuardJson, validateDisplayName } from '@/lib/profile-text-guard';
import { isRussianEmail, RU_EMAIL_HINT } from '@/lib/ru-email';
import { normalizePhone } from '@/lib/phone';
import { sendEmail, isOutboundEmailReady } from '@/lib/email';
import { completeRegistration } from '@/lib/complete-registration';
import { originFromEnv } from '@/lib/site-identity-shared';
import { getAccessSettings } from '@/lib/access-settings';
import { consumeCaptchaToken } from '@/lib/captcha';
import {
  assertRegistrationAllowed,
  logRegistrationAttempt,
} from '@/lib/registration-guard';
import { requestClientIp } from '@/lib/request-ip';
import { escapeHtml } from '@/lib/html-escape';
import { assertSameOrigin } from '@/lib/csrf-origin';

const registerSchema = z.object({
  name: z.string().min(2, 'Имя слишком короткое').max(100),
  email: z.string().email('Некорректный email'),
  phone: z.string().min(10, 'Некорректный телефон').max(30),
  password: z
    .string()
    .min(10, 'Пароль должен быть минимум 10 символов')
    .max(100)
    .refine((p) => /[A-Za-zА-Яа-яЁё]/.test(p) && /\d/.test(p), {
      message: 'Пароль должен содержать буквы и цифры',
    }),
  birthDate: z.string().min(8, 'Укажите дату рождения'),
  privacyAccepted: z.boolean().refine((v) => v === true, {
    message: 'Нужно принять политику, правила и cookie',
  }),
  personalDataConsent: z.boolean().refine((v) => v === true, {
    message: 'Нужно согласие на обработку персональных данных',
  }),
  captchaToken: z.string().min(10, 'Пройдите проверку'),
  website: z.string().optional(),
  ref: z.string().max(24).optional(),
  fingerprint: z.string().max(128).optional(),
});

const EXISTING_ACCOUNT_MSG =
  'Если аккаунт с такими данными уже есть — войдите или восстановите пароль. Иначе проверьте введённые данные.';

function ageFromBirthDate(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export async function POST(req: Request) {
  {
    const blocked = await rejectIfModuleDisabled('registration');
    if (blocked) return blocked;
  }
  try {
    const access = await getAccessSettings();
    if (!access.registrationEnabled) {
      return NextResponse.json(
        { message: 'Регистрация временно закрыта администрацией портала.' },
        { status: 403 }
      );
    }

    const originBlock = assertSameOrigin(req);
    if (originBlock) return originBlock;

    const ip = requestClientIp(req);
    if (!(await registerRateLimiter.checkAsync(ip))) {
      return NextResponse.json(
        rateLimitJson('Слишком много запросов. Попробуйте позже.'),
        { status: 429 }
      );
    }

    const body = await req.json();
    const parseResult = registerSchema.safeParse(body);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues[0]?.message || 'Некорректные данные';
      return NextResponse.json({ message: errorMsg }, { status: 400 });
    }

    const cap = await consumeCaptchaToken(parseResult.data.captchaToken, parseResult.data.website);
    if (!cap.ok) {
      return NextResponse.json({ message: cap.message }, { status: 400 });
    }

    const soft = await assertRegistrationAllowed({
      ip,
      fingerprint: (parseResult.data.fingerprint || '').trim() || null,
    });
    if (!soft.ok) {
      await logRegistrationAttempt({
        ip,
        fingerprint: parseResult.data.fingerprint,
        email: parseResult.data.email,
        phone: parseResult.data.phone,
        success: false,
        blocked: soft.softBlock,
        reason: soft.message,
      });
      return NextResponse.json({ message: soft.message }, { status: 429 });
    }

    let name = parseResult.data.name.trim();
    const email = parseResult.data.email.trim().toLowerCase();
    const password = parseResult.data.password;
    const birthDateRaw = parseResult.data.birthDate.trim().slice(0, 10);
    const phoneDigits = normalizePhone(parseResult.data.phone);
    const phone = phoneDigits ? `+${phoneDigits}` : '';

    if (!isRussianEmail(email)) {
      return NextResponse.json({ message: RU_EMAIL_HINT }, { status: 400 });
    }
    if (phoneDigits.length < 11) {
      return NextResponse.json({ message: 'Укажите корректный российский телефон' }, { status: 400 });
    }

    const age = ageFromBirthDate(birthDateRaw);
    if (age === null) {
      return NextResponse.json({ message: 'Некорректная дата рождения' }, { status: 400 });
    }
    if (age < 14) {
      return NextResponse.json(
        { message: 'Регистрация доступна с 14 лет (152-ФЗ)' },
        { status: 400 }
      );
    }

    const nameCheck = validateDisplayName(name);
    if (!nameCheck.ok) return nameGuardJson(nameCheck);
    name = nameCheck.name;

    const dirty = profanityResponse(name);
    if (dirty) return dirty;

    const existingByEmail = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existingByEmail) {
      await logRegistrationAttempt({
        ip,
        fingerprint: parseResult.data.fingerprint,
        email,
        phone,
        success: false,
        reason: 'email_exists',
      });
      return NextResponse.json({ message: EXISTING_ACCOUNT_MSG }, { status: 400 });
    }

    const national = phoneDigits.slice(-10);
    const phoneConflict = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "User"
      WHERE length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
        AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = ${national}
      LIMIT 1
    `;
    if (phoneConflict[0]) {
      await logRegistrationAttempt({
        ip,
        fingerprint: parseResult.data.fingerprint,
        email,
        phone,
        success: false,
        reason: 'phone_exists',
      });
      return NextResponse.json({ message: EXISTING_ACCOUNT_MSG }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    // 8-digit OTP; short TTL + rate-limit on /api/verify
    const code = String(crypto.randomInt(10_000_000, 100_000_000));
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    const { isModuleEnabled } = await import('@/lib/module-flags');
    const referralsOn = await isModuleEnabled('referrals');
    const referralCode =
      referralsOn ? (parseResult.data.ref || '').trim().slice(0, 24) || null : null;
    const meta = JSON.stringify({
      privacyAccepted: true,
      personalDataConsent: true,
      birthDate: birthDateRaw,
      referralCode,
      fingerprint: (parseResult.data.fingerprint || '').trim().slice(0, 128) || null,
      signupIp: ip,
    });

    const metaObj = {
      privacyAccepted: true,
      personalDataConsent: true,
      birthDate: birthDateRaw,
      referralCode,
      fingerprint: (parseResult.data.fingerprint || '').trim().slice(0, 128) || null,
      signupIp: ip,
    };

    // Production: never skip email OTP. Dev may activate when ALLOW_SKIP_EMAIL_VERIFY=1.
    const allowSkipVerify =
      process.env.NODE_ENV !== 'production' && process.env.ALLOW_SKIP_EMAIL_VERIFY === '1';

    if (!(await isOutboundEmailReady())) {
      if (!allowSkipVerify) {
        await prisma.pendingUser.deleteMany({
          where: { OR: [{ email }, { phone }] },
        });
        const pending = await prisma.pendingUser.create({
          data: {
            name,
            email,
            phone,
            password: hashedPassword,
            token: code,
            expires,
            meta,
          },
        });
        await logRegistrationAttempt({
          ip,
          fingerprint: parseResult.data.fingerprint,
          email,
          phone,
          success: true,
          reason: 'pending_no_mail',
        });
        void import('@/lib/notifications')
          .then(({ notifyStaffPendingRegistration }) =>
            notifyStaffPendingRegistration({
              pendingId: pending.id,
              name,
              email,
              phone,
              reason: 'pending_no_mail',
            })
          )
          .catch(() => null);
        return NextResponse.json(
          {
            message:
              'Заявка принята, но почтовый сервис временно недоступен. Администратор подтвердит регистрацию вручную, либо повторите позже.',
            requiresVerification: true,
            email,
            emailDeliveryFailed: true,
            pendingManual: true,
          },
          { status: 503 }
        );
      }
      await prisma.pendingUser.deleteMany({
        where: { OR: [{ email }, { phone }] },
      });
      const user = await completeRegistration({
        name,
        email,
        phone,
        passwordHash: hashedPassword,
        meta: metaObj,
        ip,
      });
      await logRegistrationAttempt({
        ip,
        fingerprint: parseResult.data.fingerprint,
        email,
        phone,
        success: true,
        reason: 'activated_dev_skip',
      });
      console.info('[register] DEV skip email — account activated', user.id);
      return NextResponse.json(
        {
          message: 'Регистрация завершена (dev). Можно войти.',
          requiresVerification: false,
          email,
          emailSkipped: true,
        },
        { status: 201 }
      );
    }

    await prisma.pendingUser.deleteMany({
      where: { OR: [{ email }, { phone }] },
    });

    const pending = await prisma.pendingUser.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        token: code,
        expires,
        meta,
      },
    });
    await logRegistrationAttempt({
      ip,
      fingerprint: parseResult.data.fingerprint,
      email,
      phone,
      success: true,
      reason: 'pending_created',
    });
    void import('@/lib/notifications')
      .then(({ notifyStaffPendingRegistration }) =>
        notifyStaffPendingRegistration({
          pendingId: pending.id,
          name,
          email,
          phone,
          reason: 'pending_created',
        })
      )
      .catch(() => null);

    const origin = originFromEnv({ allowLocal: process.env.NODE_ENV !== 'production' });
    const verifyUrl = `${origin}/verify?email=${encodeURIComponent(email)}`;
    const safeName = escapeHtml(name);
    const mailed = await sendEmail(
      email,
      'Код подтверждения — Young Portal',
      `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#1e3a5f;margin:0 0 12px">Подтверждение регистрации</h2>
          <p style="color:#475569;line-height:1.5">Здравствуйте, ${safeName}!</p>
          <p style="color:#475569;line-height:1.5">Ваш код подтверждения:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#0f766e;margin:16px 0">${code}</p>
          <p style="color:#64748b;font-size:14px">Код действителен 1 час.</p>
          <p style="margin-top:20px"><a href="${verifyUrl}" style="color:#2563eb">Открыть страницу подтверждения</a></p>
        </div>
      `
    );

    if (!mailed.success) {
      // Keep PendingUser so admins can activate or resend when mail provider is down.
      console.error('[register] email send failed', mailed.error, mailed.provider);
      void import('@/lib/notifications')
        .then(({ notifyStaffPendingRegistration }) =>
          notifyStaffPendingRegistration({
            pendingId: pending.id,
            name,
            email,
            phone,
            reason: 'pending_no_mail',
          })
        )
        .catch(() => null);
      return NextResponse.json(
        {
          message:
            'Заявка создана, но письмо с кодом не удалось отправить. Попробуйте позже или обратитесь к администратору портала — заявку можно подтвердить вручную.',
          requiresVerification: true,
          email,
          emailDeliveryFailed: true,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        message: 'Код подтверждения отправлен на email',
        requiresVerification: true,
        email,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Ошибка при регистрации:', error);
    return NextResponse.json({ message: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
