import { rejectIfModuleDisabled } from '@/lib/require-module';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { consumeCaptchaToken } from '@/lib/captcha';
import { checkVacancyEligibility, scoreVacancyAnswers } from '@/lib/vacancy-eligibility';
import { bumpEcoPoints, ECO } from '@/lib/eco-points';
import { evaluateAchievements } from '@/lib/award-achievements';
import { assertSameOrigin } from '@/lib/csrf-origin';

const bodySchema = z.object({
  vacancyId: z.string().min(1),
  coverLetter: z.string().max(2000).optional(),
  answers: z.record(z.string(), z.unknown()).default({}),
  captchaToken: z.string().min(10),
  website: z.string().optional(),
});

export async function POST(req: Request) {
  {
    const csrf = assertSameOrigin(req);
    if (csrf) return csrf;
  }
  {
    const blocked = await rejectIfModuleDisabled('vacancies');
    if (blocked) return blocked;
  }
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Войдите в аккаунт' }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message || 'Некорректные данные' }, { status: 400 });
    }

    const cap = await consumeCaptchaToken(parsed.data.captchaToken, parsed.data.website);
    if (!cap.ok) {
      return NextResponse.json({ message: cap.message }, { status: 400 });
    }

    const elig = await checkVacancyEligibility(session.user.id, parsed.data.vacancyId);
    if (!elig.ok) {
      return NextResponse.json({ message: elig.message, code: elig.code }, { status: 400 });
    }

    const existing = await prisma.vacancyApplication.findUnique({
      where: {
        userId_vacancyId: { userId: session.user.id, vacancyId: parsed.data.vacancyId },
      },
    });
    if (existing && ['PENDING_REVIEW', 'APPROVED', 'SCREENING'].includes(existing.status)) {
      return NextResponse.json({ message: 'Отклик уже подан', status: existing.status }, { status: 400 });
    }

    const vacancy = elig.vacancy!;
    const scored = scoreVacancyAnswers(vacancy.questions, parsed.data.answers);
    const autoPassed = !scored.knockoutFailed && scored.percent >= (vacancy.screenPassScore || 70);

    const status = autoPassed ? 'PENDING_REVIEW' : 'REJECTED';
    const rejectReason = autoPassed
      ? null
      : scored.knockoutFailed
        ? 'Не пройден автоматический скрининг (обязательный вопрос)'
        : `Не пройден автоматический скрининг (балл ${scored.percent}%)`;

    const app = await prisma.vacancyApplication.upsert({
      where: {
        userId_vacancyId: { userId: session.user.id, vacancyId: parsed.data.vacancyId },
      },
      create: {
        userId: session.user.id,
        vacancyId: parsed.data.vacancyId,
        coverLetter: parsed.data.coverLetter || null,
        answersJson: JSON.stringify(parsed.data.answers),
        autoScore: scored.percent,
        autoPassed,
        status,
        rejectReason,
      },
      update: {
        coverLetter: parsed.data.coverLetter || null,
        answersJson: JSON.stringify(parsed.data.answers),
        autoScore: scored.percent,
        autoPassed,
        status,
        rejectReason,
        updatedAt: new Date(),
      },
    });

    if (autoPassed) {
      await bumpEcoPoints(session.user.id, ECO.VACANCY_SCREEN_PASS || 10, 'vacancy_screen_pass', {
        vacancyId: parsed.data.vacancyId,
      }).catch(() => null);
      await evaluateAchievements(session.user.id).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      application: {
        id: app.id,
        status: app.status,
        autoPassed,
        autoScore: scored.percent,
      },
      message: autoPassed
        ? 'Скрининг пройден — заявка на рассмотрении'
        : 'Скрининг не пройден. Можно улучшить ответы и попробовать снова после отзыва.',
    });
  } catch (e) {
    console.error('vacancy apply', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function GET() {
  {
    const blocked = await rejectIfModuleDisabled('vacancies');
    if (blocked) return blocked;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const items = await prisma.vacancyApplication.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      vacancy: {
        select: {
          id: true,
          title: true,
          status: true,
          employer: { select: { title: true, isInternal: true } },
        },
      },
    },
  });
  return NextResponse.json({ items });
}

/** Withdraw a pending review application */
export async function DELETE(req: Request) {
  {
    const csrf = assertSameOrigin(req);
    if (csrf) return csrf;
  }
  {
    const blocked = await rejectIfModuleDisabled('vacancies');
    if (blocked) return blocked;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Войдите' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const vacancyId = String(body.vacancyId || '');
  if (!vacancyId) {
    return NextResponse.json({ message: 'Не указана вакансия' }, { status: 400 });
  }
  const app = await prisma.vacancyApplication.findUnique({
    where: { userId_vacancyId: { userId: session.user.id, vacancyId } },
  });
  if (!app) {
    return NextResponse.json({ message: 'Отклик не найден' }, { status: 404 });
  }
  if (!['PENDING_REVIEW', 'SCREENING', 'PENDING', 'REJECTED'].includes(app.status)) {
    return NextResponse.json({ message: 'Этот отклик нельзя отозвать' }, { status: 400 });
  }
  await prisma.vacancyApplication.update({
    where: { id: app.id },
    data: { status: 'WITHDRAWN', rejectReason: null },
  });
  return NextResponse.json({ ok: true });
}
