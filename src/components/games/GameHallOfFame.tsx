'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';
import { GAMES, type GameId } from '@/lib/games';
import {
  CHECKERS_DIFFICULTIES,
  formatDuration,
  type CheckersDifficulty,
  type FifteenDifficulty,
  type LeaderRow,
} from '@/lib/game-meta';

type Props = {
  game: GameId;
  difficulty?: CheckersDifficulty | FifteenDifficulty;
  onDifficultyChange?: (d: CheckersDifficulty | FifteenDifficulty) => void;
  compact?: boolean;
  /** Rows to show in the compact strip (default 3). */
  topN?: number;
  currentUserId?: string | null;
};

const hofCache = new Map<string, LeaderRow[]>();
function hofKey(game: string, diff: string, limit: number) {
  return `${game}:${diff}:${limit}`;
}

export default function GameHallOfFame({
  game,
  difficulty = 'medium',
  onDifficultyChange,
  compact,
  topN,
  currentUserId,
}: Props) {
  const limit = topN ?? (compact ? 3 : 10);
  const [diff, setDiff] = useState<CheckersDifficulty | FifteenDifficulty>(difficulty);
  const cacheId = hofKey(game, String(diff), limit);
  const [leaders, setLeaders] = useState<LeaderRow[]>(() => hofCache.get(cacheId) || []);
  const [loading, setLoading] = useState(() => !hofCache.has(cacheId));

  useEffect(() => setDiff(difficulty), [difficulty]);

  useEffect(() => {
    let cancelled = false;
    const id = hofKey(game, String(diff), limit);
    const cached = hofCache.get(id);
    if (cached) {
      setLeaders(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    const q = new URLSearchParams({ game, limit: String(limit) });
    if (game === 'checkers') q.set('difficulty', String(diff));
    void fetch(`/api/games/leaderboard?${q}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const next = Array.isArray(data?.leaders) ? (data.leaders as LeaderRow[]) : [];
        hofCache.set(id, next);
        setLeaders(next);
      })
      .catch(() => {
        if (!cancelled && !hofCache.has(id)) setLeaders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [game, diff, limit]);

  const accent = GAMES[game].accent;
  const top100Href = `/games?tab=leaders&game=${game}${
    game === 'checkers' ? `&difficulty=${diff}` : ''
  }`;

  return (
    <section
      className={`game-hof${compact ? ' is-compact' : ''}`}
      aria-label="Таблица почёта"
      style={{ ['--game-accent' as string]: accent }}
    >
      <div className="game-hof-head">
        <h3>
          <Crown size={14} style={{ color: accent }} /> Топ {limit}
        </h3>
        <div className="game-hof-head-actions">
          {game === 'checkers' && onDifficultyChange ? (
            <div className="game-hof-diffs" role="group" aria-label="Сложность">
              {CHECKERS_DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`game-hof-diff${diff === d.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setDiff(d.id);
                    onDifficultyChange(d.id);
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          ) : null}
          {limit < 100 ? (
            <Link href={top100Href} className="game-hof-more" prefetch>
              Топ 100 →
            </Link>
          ) : null}
        </div>
      </div>
      {leaders.length > 0 ? (
        <ol className="game-hof-list">
          {leaders.map((row) => {
            const isMe = currentUserId && row.userId === currentUserId;
            return (
              <li key={`${row.rank}-${row.name}`} className={isMe ? 'is-me' : undefined}>
                <span className="game-hof-rank">{row.rank === 1 ? '👑' : row.rank}</span>
                <span className="game-hof-name" title={row.name}>
                  {row.name}
                  {isMe ? <em>вы</em> : null}
                  {row.rank === 1 ? <em className="is-leader">лидер</em> : null}
                </span>
                <strong className="game-hof-score">
                  {game === 'checkers' && row.durationMs
                    ? formatDuration(row.durationMs)
                    : row.score}
                </strong>
              </li>
            );
          })}
        </ol>
      ) : loading ? (
        <p className="game-hof-empty">Загрузка…</p>
      ) : (
        <p className="game-hof-empty">
          {game === 'checkers'
            ? 'Пока нет рекордов на время — вы можете стать первым.'
            : 'Пока пусто — поставьте рекорд.'}
        </p>
      )}
    </section>
  );
}
