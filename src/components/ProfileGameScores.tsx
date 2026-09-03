'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Crown } from 'lucide-react';
import { GAMES, type GameId } from '@/lib/games';
import { flushGameScoreQueue, getLocalBest } from '@/lib/game-scores-client';
import { CHECKERS_DIFFICULTIES, formatDuration, getLocalBestTime, parseGameMeta } from '@/lib/game-meta';

type LeaderFlags = Partial<Record<GameId, boolean>>;
type TimeMap = Partial<Record<GameId, number>>;

export default function ProfileGameScores() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const [scores, setScores] = useState<Partial<Record<GameId, number>>>({});
  const [times, setTimes] = useState<TimeMap>({});
  const [leaders, setLeaders] = useState<LeaderFlags>({});

  useEffect(() => {
    const local: Partial<Record<GameId, number>> = {};
    const localTimes: TimeMap = {};
    for (const id of Object.keys(GAMES) as GameId[]) {
      const b = getLocalBest(id);
      if (b > 0) local[id] = b;
      const t = getLocalBestTime(id);
      if (t > 0) localTimes[id] = t;
    }
    setScores(local);
    setTimes(localTimes);

    void (async () => {
      await flushGameScoreQueue();
      try {
        const res = await fetch('/api/user/games', { credentials: 'include' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          scores?: { game: string; score: number; meta?: string | null }[];
        };
        const next = { ...local };
        const nextTimes = { ...localTimes };
        for (const row of data.scores ?? []) {
          const id = row.game as GameId;
          if (!(id in GAMES)) continue;
          next[id] = Math.max(next[id] ?? 0, row.score);
          const meta = parseGameMeta(row.meta);
          const vals = meta.bestTimes
            ? (Object.values(meta.bestTimes).filter((n) => typeof n === 'number' && n > 0) as number[])
            : [];
          if (vals.length) {
            const bestT = Math.min(...vals);
            nextTimes[id] = nextTimes[id] ? Math.min(nextTimes[id]!, bestT) : bestT;
          }
        }
        setScores(next);
        setTimes(nextTimes);
      } catch {
        /* offline */
      }

      if (!userId) return;
      const flags: LeaderFlags = {};
      await Promise.all(
        (Object.keys(GAMES) as GameId[]).map(async (id) => {
          try {
            if (id === 'checkers') {
              for (const d of CHECKERS_DIFFICULTIES) {
                const r = await fetch(`/api/games/leaderboard?game=checkers&difficulty=${d.id}&limit=1`);
                if (!r.ok) continue;
                const data = await r.json();
                if (data?.leaders?.[0]?.userId === userId) {
                  flags.checkers = true;
                  break;
                }
              }
            } else {
              const r = await fetch(`/api/games/leaderboard?game=${id}&limit=1`);
              if (!r.ok) return;
              const data = await r.json();
              if (data?.leaders?.[0]?.userId === userId) flags[id] = true;
            }
          } catch {
            /* ignore */
          }
        })
      );
      setLeaders(flags);
    })();
  }, [userId]);

  const hasAny = Object.values(scores).some((s) => (s ?? 0) > 0) || Object.values(times).some((t) => (t ?? 0) > 0);

  return (
    <div
      style={{
        padding: '0.85rem 1rem',
        borderRadius: 12,
        background: 'rgba(15,23,42,0.03)',
        border: '1px solid rgba(15,23,42,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Игровые рекорды</div>
        <Link
          href="/games"
          style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}
        >
          Играть →
        </Link>
      </div>
      <p style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.4 }}>
        Очки и лучшее время — в таблице почёта. Корона = вы сейчас лидер сайта.
      </p>
      {hasAny ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {(Object.keys(GAMES) as GameId[]).map((id) => {
            const s = scores[id] ?? 0;
            const t = times[id] ?? 0;
            if (s <= 0 && t <= 0) return null;
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.9rem',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: GAMES[id].accent,
                      flexShrink: 0,
                    }}
                  />
                  {GAMES[id].title}
                  {leaders[id] ? (
                    <span className="profile-leader-chip" title="Действующий лидер таблицы почёта">
                      <Crown size={11} /> лидер
                    </span>
                  ) : null}
                </span>
                <strong style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                  {id === 'checkers' && t > 0 ? formatDuration(t) : s}
                  {id === 'checkers' && s > 0 && t > 0 ? (
                    <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)' }}>
                      очки {s}
                    </span>
                  ) : null}
                </strong>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
          Пока пусто — 5 раз тапните по названию сайта в шапке.
        </p>
      )}
    </div>
  );
}
