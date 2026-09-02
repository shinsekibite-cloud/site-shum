/** Client-safe contest eligibility helpers (no Prisma). */

export type ContestEligibility = {
  minSocial?: number;
  minReliability?: number;
  needCheckIn?: boolean;
  /** One vote across the whole contest (not per work) */
  oneVotePerContest?: boolean;
};

export function parseContestEligibility(raw: string | null | undefined): ContestEligibility {
  if (!raw?.trim()) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return {};
    const out: ContestEligibility = {};
    if (typeof o.minSocial === 'number') out.minSocial = o.minSocial;
    if (typeof o.minReliability === 'number') out.minReliability = o.minReliability;
    if (typeof o.needCheckIn === 'boolean') out.needCheckIn = o.needCheckIn;
    if (typeof o.oneVotePerContest === 'boolean') out.oneVotePerContest = o.oneVotePerContest;
    return out;
  } catch {
    return {};
  }
}

export const CONTEST_STATUS_RU: Record<string, string> = {
  OPEN: 'Приём работ',
  VOTING: 'Голосование',
  CLOSED: 'Завершён',
  DRAFT: 'Черновик',
  ARCHIVED: 'Архив',
};

export const CONTEST_KIND_RU: Record<string, string> = {
  SUBMISSION: 'Конкурс работ',
  RAFFLE: 'Розыгрыш',
};
