import { rejectIfModuleDisabled } from '@/lib/require-module';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sanitizeCmsHtml } from '@/lib/sanitize-html';
import { safeHttpUrl } from '@/lib/safe-url';
import {
  checkContestEligibility,
  parseContestEligibility,
} from '@/lib/contest-eligibility';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  {
    const blocked = await rejectIfModuleDisabled('contests');
    if (blocked) return blocked;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Войдите в аккаунт' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const contest = await prisma.contest.findUnique({
    where: { id },
    include: {
      booking: { select: { id: true, title: true, startTime: true } },
      winners: {
        orderBy: { place: 'asc' },
        include: { user: { select: { id: true, name: true, publicCode: true } } },
      },
      _count: { select: { submissions: true, raffleEntries: true } },
    },
  });
  if (!contest || !['OPEN', 'VOTING', 'CLOSED'].includes(contest.status)) {
    return NextResponse.json({ message: 'Конкурс недоступен' }, { status: 404 });
  }

  const submissions =
    contest.kind === 'SUBMISSION'
      ? await prisma.contestSubmission.findMany({
          where: {
            contestId: id,
            status: contest.status === 'OPEN' ? { in: ['APPROVED', 'PENDING'] } : 'APPROVED',
          },
          orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
          take: 100,
          select: {
            id: true,
            title: true,
            bodyText: true,
            imageUrl: true,
            linkUrl: true,
            status: true,
            voteCount: true,
            user: { select: { id: true, name: true, publicCode: true } },
            createdAt: true,
          },
        })
      : [];

  const uid = session.user.id;
  const visibleSubs = submissions.filter((s) => s.status === 'APPROVED' || s.user.id === uid);

  const myVotes = await prisma.contestVote.findMany({
    where: {
      userId: uid,
      submission: { contestId: id },
    },
    select: { submissionId: true },
  });
  const votedIds = new Set(myVotes.map((v) => v.submissionId));

  const elig = await checkContestEligibility(uid, contest);
  const rules = parseContestEligibility(contest.eligibilityJson);

  const {
    eligibilityJson: _ej,
    drawSeed: _ds,
    ...publicContest
  } = contest as typeof contest & { drawSeed?: string | null };

  return NextResponse.json({
    contest: {
      ...publicContest,
      rulesHtml: sanitizeCmsHtml(contest.rulesHtml),
      eligibility: {
        minSocial: rules.minSocial ?? null,
        minReliability: rules.minReliability ?? null,
        needCheckIn: Boolean(rules.needCheckIn),
        oneVotePerContest: rules.oneVotePerContest !== false,
      },
    },
    submissions: visibleSubs.map((s) => ({
      ...s,
      imageUrl: safeHttpUrl(s.imageUrl),
      linkUrl: safeHttpUrl(s.linkUrl),
      iVoted: votedIds.has(s.id),
      isMine: s.user.id === uid,
    })),
    eligibility: elig.ok
      ? { ok: true }
      : { ok: false, message: elig.message, code: elig.code },
    myVoteCount: myVotes.length,
  });
}
