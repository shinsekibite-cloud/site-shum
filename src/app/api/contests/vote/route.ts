import { rejectIfModuleDisabled } from '@/lib/require-module';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isEndUserRole } from '@/lib/acl-shared';
import { consumeCaptchaToken } from '@/lib/captcha';
import { assertSameOrigin } from '@/lib/csrf-origin';
import {
  checkContestEligibility,
  parseContestEligibility,
} from '@/lib/contest-eligibility';

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
      return NextResponse.json({ message: 'Войдите' }, { status: 401 });
    }
    const body = await req.json();
    const submissionId = String(body.submissionId || '');
    const cap = await consumeCaptchaToken(body.captchaToken, body.website);
    if (!cap.ok) return NextResponse.json({ message: cap.message }, { status: 400 });

    const sub = await prisma.contestSubmission.findUnique({
      where: { id: submissionId },
      include: { contest: true },
    });
    if (!sub || sub.status !== 'APPROVED') {
      return NextResponse.json({ message: 'Работа недоступна для голосования' }, { status: 400 });
    }
    const c = sub.contest;
    if (!c.allowVoting || !['OPEN', 'VOTING'].includes(c.status)) {
      return NextResponse.json({ message: 'Голосование закрыто' }, { status: 400 });
    }
    if (c.voteEndsAt && c.voteEndsAt.getTime() < Date.now()) {
      return NextResponse.json({ message: 'Срок голосования истёк' }, { status: 400 });
    }
    if (sub.userId === session.user.id) {
      return NextResponse.json({ message: 'Нельзя голосовать за свою работу' }, { status: 400 });
    }

    const elig = await checkContestEligibility(session.user.id, c);
    if (!elig.ok) {
      return NextResponse.json({ message: elig.message, code: elig.code }, { status: 400 });
    }

    const rules = parseContestEligibility(c.eligibilityJson);
    const oneVote = rules.oneVotePerContest !== false;
    if (oneVote) {
      const prior = await prisma.contestVote.findFirst({
        where: {
          userId: session.user.id,
          submission: { contestId: c.id },
        },
        select: { id: true },
      });
      if (prior) {
        return NextResponse.json(
          { message: 'В этом конкурсе можно отдать только один голос' },
          { status: 400 }
        );
      }
    }

    try {
      await prisma.contestVote.create({
        data: { submissionId, userId: session.user.id },
      });
    } catch {
      return NextResponse.json({ message: 'Вы уже голосовали за эту работу' }, { status: 400 });
    }
    const updated = await prisma.contestSubmission.update({
      where: { id: submissionId },
      data: { voteCount: { increment: 1 } },
    });
    return NextResponse.json({ ok: true, voteCount: updated.voteCount });
  } catch (e) {
    console.error('contest vote', e);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}
