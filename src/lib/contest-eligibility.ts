import { prisma } from '@/lib/prisma';
import { isEndUserRole } from '@/lib/acl-shared';
import {
  parseContestEligibility,
  type ContestEligibility,
} from '@/lib/contest-eligibility-shared';

export type { ContestEligibility };
export {
  parseContestEligibility,
  CONTEST_STATUS_RU,
  CONTEST_KIND_RU,
} from '@/lib/contest-eligibility-shared';

export type ContestEligOk = { ok: true; rules: ContestEligibility };
export type ContestEligFail = { ok: false; code: string; message: string };
export type ContestEligResult = ContestEligOk | ContestEligFail;

export async function checkContestEligibility(
  userId: string,
  contest: {
    id: string;
    bookingId: string | null;
    eligibilityJson: string | null;
  }
): Promise<ContestEligResult> {
  const rules = parseContestEligibility(contest.eligibilityJson);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      blockedAt: true,
      deletedAt: true,
      reliabilityScore: true,
      socialScore: true,
    },
  });
  if (!user || user.deletedAt) {
    return { ok: false, code: 'NO_USER', message: 'Войдите в аккаунт' };
  }
  if (user.blockedAt) {
    return { ok: false, code: 'BLOCKED', message: 'Аккаунт заблокирован' };
  }
  if (!isEndUserRole(user.role)) {
    return { ok: false, code: 'ROLE', message: 'Сервисная учётка не участвует в конкурсах' };
  }
  if (rules.minReliability != null && (user.reliabilityScore ?? 100) < rules.minReliability) {
    return {
      ok: false,
      code: 'RELIABILITY',
      message: `Нужен авторитет не ниже ${rules.minReliability}`,
    };
  }
  if (rules.minSocial != null && (user.socialScore ?? 50) < rules.minSocial) {
    return {
      ok: false,
      code: 'SOCIAL',
      message: `Нужен соцрейтинг не ниже ${rules.minSocial}`,
    };
  }
  if (rules.needCheckIn && contest.bookingId) {
    const checked = await prisma.ticketCheckIn.findFirst({
      where: {
        userId,
        bookingId: contest.bookingId,
      },
      select: { id: true },
    });
    if (!checked) {
      return {
        ok: false,
        code: 'CHECKIN',
        message: 'Нужен check-in на связанном мероприятии',
      };
    }
  }
  return { ok: true, rules };
}
