import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { unlockAchievement, evaluateAchievements } from '@/lib/award-achievements';
import { ALL_GUIDE_IDS, INSTRUCTIONS_VERSION, isInstructionsBadgeActive } from '@/lib/profile-guides';
import { bumpEcoPoints, ECO } from '@/lib/eco-points';
import { onReferralInstructionsComplete } from '@/lib/referrals';

const bodySchema = z.object({
  action: z.enum(['complete', 'status', 'invalidate', 'dismiss_prompt', 'skip_prompt']),
  version: z.string().max(64).optional(),
  viewedIds: z.array(z.string().max(40)).max(20).optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        instructionsVersion: true,
        instructionsCompletedAt: true,
        instructionsPromptDismissedAt: true,
      },
    });

    const completed = isInstructionsBadgeActive({
      instructionsVersion: user?.instructionsVersion,
      instructionsCompletedAt: user?.instructionsCompletedAt,
    });

    return NextResponse.json({
      ok: true,
      currentVersion: INSTRUCTIONS_VERSION,
      guideIds: ALL_GUIDE_IDS,
      instructionsVersion: user?.instructionsVersion ?? null,
      instructionsCompletedAt: user?.instructionsCompletedAt?.toISOString() ?? null,
      promptDismissed: Boolean(user?.instructionsPromptDismissedAt),
      completed,
    });
  } catch (e) {
    console.error('GET /api/user/instructions', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ message: 'Некорректные данные' }, { status: 400 });
    }

    const { action, version, viewedIds } = parsed.data;

    if (action === 'status') {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          instructionsVersion: true,
          instructionsCompletedAt: true,
          instructionsPromptDismissedAt: true,
        },
      });
      return NextResponse.json({
        ok: true,
        currentVersion: INSTRUCTIONS_VERSION,
        completed: isInstructionsBadgeActive({
          instructionsVersion: user?.instructionsVersion,
          instructionsCompletedAt: user?.instructionsCompletedAt,
        }),
        instructionsVersion: user?.instructionsVersion ?? null,
        instructionsCompletedAt: user?.instructionsCompletedAt?.toISOString() ?? null,
        promptDismissed: Boolean(user?.instructionsPromptDismissedAt),
      });
    }

    if (action === 'invalidate') {
      const user = await prisma.user.update({
        where: { id: session.user.id },
        data: {
          instructionsCompletedAt: null,
          // keep version stamp empty so badge stays off until full re-complete
          instructionsVersion: null,
        },
        select: { instructionsVersion: true, instructionsCompletedAt: true },
      });
      return NextResponse.json({
        ok: true,
        completed: false,
        version: null,
        completedAt: null,
        instructionsVersion: user.instructionsVersion,
      });
    }

    if (action === 'dismiss_prompt') {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { instructionsPromptDismissedAt: new Date() },
      });
      return NextResponse.json({ ok: true, promptDismissed: true });
    }

    if (action === 'skip_prompt') {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // complete
    if (version && version !== INSTRUCTIONS_VERSION) {
      return NextResponse.json(
        {
          message: 'Версия инструкций устарела — обновите страницу',
          currentVersion: INSTRUCTIONS_VERSION,
        },
        { status: 409 }
      );
    }

    const ids = Array.isArray(viewedIds) ? viewedIds : [];
    const missing = ALL_GUIDE_IDS.filter((id) => !ids.includes(id));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          message: 'Просмотрите все инструкции текущего набора',
          missing,
          currentVersion: INSTRUCTIONS_VERSION,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        instructionsVersion: INSTRUCTIONS_VERSION,
        instructionsCompletedAt: now,
      },
      select: {
        instructionsVersion: true,
        instructionsCompletedAt: true,
      },
    });

    await unlockAchievement(session.user.id, 'INSTRUCTED');
    await unlockAchievement(session.user.id, 'MODERN_USER');
    void bumpEcoPoints(session.user.id, ECO.GUIDE_COMPLETE, 'instructions_complete').catch(() => null);
    void onReferralInstructionsComplete(session.user.id).catch(() => null);
    await evaluateAchievements(session.user.id).catch(() => null);

    return NextResponse.json({
      ok: true,
      completed: true,
      version: user.instructionsVersion,
      completedAt: user.instructionsCompletedAt?.toISOString() ?? now.toISOString(),
      unlocked: ['INSTRUCTED', 'MODERN_USER'],
    });
  } catch (e) {
    console.error('POST /api/user/instructions', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
