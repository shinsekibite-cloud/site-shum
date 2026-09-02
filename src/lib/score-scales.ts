/**
 * М-балл + зелёный балл — две независимые шкалы репутации ЦРМ
 * (не деньги, не магазин ecoPoints / мбаллы).
 */
import { prisma } from '@/lib/prisma';
import { logReputationEvent, type ReputationKind } from '@/lib/reputation-history';

export const M_BALL = {
  CHECK_IN: 5,
  ECO_EVENT_BONUS: 5,
  BOOKING_ATTEND: 8,
  BOOKING_NO_SHOW: -4,
  PROJECT_APPROVED: 15,
} as const;

export const ECO_BALL = {
  ECO_EVENT: 10,
} as const;

export type ScoreLevelId = 'novice' | 'participant' | 'active' | 'ambassador';

export const SCORE_LEVELS: Array<{
  id: ScoreLevelId;
  label: string;
  min: number;
  max: number | null;
}> = [
  { id: 'novice', label: 'Новичок', min: 0, max: 49 },
  { id: 'participant', label: 'Участник', min: 50, max: 149 },
  { id: 'active', label: 'Актив', min: 150, max: 349 },
  { id: 'ambassador', label: 'Амбассадор', min: 350, max: null },
];

export function levelForScore(score: number) {
  const n = Math.max(0, Math.floor(score || 0));
  for (let i = SCORE_LEVELS.length - 1; i >= 0; i--) {
    if (n >= SCORE_LEVELS[i].min) {
      const cur = SCORE_LEVELS[i];
      const next = SCORE_LEVELS[i + 1];
      return {
        ...cur,
        value: n,
        nextLabel: next?.label ?? null,
        toNext: next ? Math.max(0, next.min - n) : 0,
        progress: next
          ? Math.min(1, (n - cur.min) / Math.max(1, next.min - cur.min))
          : 1,
      };
    }
  }
  return {
    ...SCORE_LEVELS[0],
    value: n,
    nextLabel: SCORE_LEVELS[1].label,
    toNext: SCORE_LEVELS[1].min - n,
    progress: n / SCORE_LEVELS[1].min,
  };
}

export function eventRewardBadge(opts?: { ecoTagged?: boolean }) {
  if (opts?.ecoTagged) {
    return { mBall: M_BALL.CHECK_IN + M_BALL.ECO_EVENT_BONUS, ecoBall: ECO_BALL.ECO_EVENT };
  }
  return { mBall: M_BALL.CHECK_IN, ecoBall: 0 };
}

function isEcoTagged(tags: string | null | undefined, category?: string | null) {
  const blob = `${tags || ''} ${category || ''}`.toLowerCase();
  return /эколог|eco|раздельн|набережн|без\s*пластик/.test(blob);
}

export async function adjustScore(opts: {
  userId: string;
  scale: 'M_BALL' | 'ECO_BALL';
  delta: number;
  reason: string;
  meta?: Record<string, unknown>;
  actorId?: string | null;
}) {
  const field = opts.scale === 'M_BALL' ? 'mBall' : 'ecoBall';
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { id: true, mBall: true, ecoBall: true },
  });
  if (!user) return null;

  const current = opts.scale === 'M_BALL' ? user.mBall : user.ecoBall;
  const next = Math.max(0, current + opts.delta);
  const applied = next - current;
  if (applied === 0 && opts.delta !== 0 && opts.delta < 0) {
    // already at floor
  }

  await prisma.user.update({
    where: { id: opts.userId },
    data: { [field]: next },
  });

  const kind = opts.scale as ReputationKind;
  await logReputationEvent({
    userId: opts.userId,
    kind,
    delta: applied,
    balanceAfter: next,
    reason: opts.reason,
    meta: {
      ...opts.meta,
      ...(opts.actorId ? { actorId: opts.actorId } : {}),
    },
  });

  return { scale: opts.scale, before: current, after: next, delta: applied };
}

export async function awardCheckInScores(opts: {
  userId: string;
  bookingId?: string | null;
  ecoTagged?: boolean;
  source: string;
}) {
  const eco = Boolean(opts.ecoTagged);
  const m = await adjustScore({
    userId: opts.userId,
    scale: 'M_BALL',
    delta: eco ? M_BALL.CHECK_IN + M_BALL.ECO_EVENT_BONUS : M_BALL.CHECK_IN,
    reason: eco ? 'Чек-ин на эко-событии' : 'Чек-ин по QR',
    meta: { source: opts.source, bookingId: opts.bookingId || null, eco },
  });
  let e = null;
  if (eco) {
    e = await adjustScore({
      userId: opts.userId,
      scale: 'ECO_BALL',
      delta: ECO_BALL.ECO_EVENT,
      reason: 'Эко-акция',
      meta: { source: opts.source, bookingId: opts.bookingId || null },
    });
  }
  return { mBall: m, ecoBall: e };
}

export { isEcoTagged };
