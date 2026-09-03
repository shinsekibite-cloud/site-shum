import { rejectIfModuleDisabled } from '@/lib/require-module';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { consumeCaptchaToken } from '@/lib/captcha';
import { isEndUserRole } from '@/lib/acl-shared';
import { bumpEcoPoints, ECO } from '@/lib/eco-points';
import { evaluateAchievements } from '@/lib/award-achievements';
import { isSafeHttpUrl, safeHttpUrl } from '@/lib/safe-url';
import { assertSameOrigin } from '@/lib/csrf-origin';
import { checkContestEligibility } from '@/lib/contest-eligibility';

const submitSchema = z.object({
  contestId: z.string().min(1),
  title: z.string().max(200).optional(),
  bodyText: z.string().max(5000).optional(),
  imageUrl: z.string().max(500).refine(isSafeHttpUrl, 'Некорректная ссылка на изображение').optional(),
  linkUrl: z.string().max(500).refine(isSafeHttpUrl, 'Некорректная ссылка').optional(),
  captchaToken: z.string().min(10),
  website: z.string().optional(),
});

export async function POST(req: Request) {
  {
    const csrf = assertSameOrigin(req);
    if (csrf) return csrf;
  }
  {
    const blocked = await rejectIfModuleDisabled('contests');
    if (blocked) return blocked;
  }
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !isEndUserRole(session.user.role)) {
      return NextResponse.json({ message: 'Войдите как участник' }, { status: 401 });
    }
    const parsed = submitSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ message: 'Некорректные данные' }, { status: 400 });
    }
    const cap = await consumeCaptchaToken(parsed.data.captchaToken, parsed.data.website);
    if (!cap.ok) return NextResponse.json({ message: cap.message }, { status: 400 });

    const contest = await prisma.contest.findUnique({ where: { id: parsed.data.contestId } });
    if (!contest || contest.kind !== 'SUBMISSION') {
      return NextResponse.json({ message: 'Конкурс не найден' }, { status: 404 });
    }
    if (contest.status !== 'OPEN') {
      return NextResponse.json({ message: 'Приём работ закрыт' }, { status: 400 });
    }
    const now = Date.now();
    if (contest.endsAt && contest.endsAt.getTime() < now) {
      return NextResponse.json({ message: 'Срок подачи истёк' }, { status: 400 });
    }
    if (!parsed.data.bodyText && !parsed.data.imageUrl && !parsed.data.linkUrl) {
      return NextResponse.json({ message: 'Добавьте текст, фото или ссылку' }, { status: 400 });
    }

    const elig = await checkContestEligibility(session.user.id, contest);
    if (!elig.ok) {
      return NextResponse.json({ message: elig.message, code: elig.code }, { status: 400 });
    }

    const count = await prisma.contestSubmission.count({
      where: { contestId: contest.id, userId: session.user.id },
    });
    if (count >= (contest.maxSubmissionsPerUser || 1)) {
      return NextResponse.json({ message: 'Лимит работ исчерпан' }, { status: 400 });
    }

    const row = await prisma.contestSubmission.create({
      data: {
        contestId: contest.id,
        userId: session.user.id,
        title: parsed.data.title || null,
        bodyText: parsed.data.bodyText || null,
        imageUrl: safeHttpUrl(parsed.data.imageUrl || '') || null,
        linkUrl: safeHttpUrl(parsed.data.linkUrl || '') || null,
        status: 'PENDING',
      },
    });

    await bumpEcoPoints(session.user.id, ECO.CONTEST_SUBMIT || 8, 'contest_submit', {
      contestId: contest.id,
    }).catch(() => null);
    await evaluateAchievements(session.user.id).catch(() => null);

    return NextResponse.json({ ok: true, submission: row });
  } catch (e) {
    console.error('contest submit', e);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}
