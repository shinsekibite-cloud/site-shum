'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { beginGameSession, getLocalBest, reportGameScore, waitForPlaySession, type GameSessionCreds } from '@/lib/game-scores-client';
import GameShell from '@/components/games/GameShell';
import GameHallOfFame from '@/components/games/GameHallOfFame';
import { sfx } from '@/lib/game-sfx';
import {
  CHECKERS_DIFFICULTIES,
  formatDuration,
  getLocalBestTime,
  setLocalBestTime,
  type CheckersDifficulty,
} from '@/lib/game-meta';
import {
  allCaptures,
  allMoves,
  applyBoardMove,
  capturesFrom,
  countSide,
  findCapture,
  initialBoard,
  isKing,
  isPlayableSquare,
  movesFrom,
  sideOf,
  type Cell,
  type Pos,
  type Side,
} from '@/lib/checkers-rules';

/** Player is white (light, bottom); AI is black (dark, top). */
const PLAYER: Side = 'light';
const AI: Side = 'dark';

function evalBoard(board: Cell[][]): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = board[r][c];
      if (!v) continue;
      const side = sideOf(v);
      const val = isKing(v) ? 4.5 : 1;
      const center = r > 1 && r < 6 && c > 1 && c < 6 ? 0.15 : 0;
      // Positive = good for AI (dark)
      score += (side === AI ? 1 : -1) * (val + center);
    }
  }
  return score;
}

function pickAiMove(
  board: Cell[][],
  difficulty: CheckersDifficulty
): { from: Pos; to: Pos } | null {
  const options = allMoves(board, AI);
  if (!options.length) return null;

  if (difficulty === 'easy') {
    // Occasionally skip a mandatory capture (human-like mistake)
    const caps = allCaptures(board, AI);
    if (caps.length && Math.random() < 0.35) {
      const quietMoves: { from: Pos; to: Pos }[] = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (sideOf(board[r][c]) !== AI) continue;
          const v = board[r][c];
          const dirs = isKing(v)
            ? [
                { r: -1, c: -1 },
                { r: -1, c: 1 },
                { r: 1, c: -1 },
                { r: 1, c: 1 },
              ]
            : [
                { r: 1, c: -1 },
                { r: 1, c: 1 },
              ];
          for (const d of dirs) {
            let nr = r + d.r;
            let nc = c + d.c;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === 0) {
              if (isPlayableSquare(nr, nc)) quietMoves.push({ from: { r, c }, to: { r: nr, c: nc } });
              if (!isKing(v)) break;
              nr += d.r;
              nc += d.c;
            }
          }
        }
      }
      if (quietMoves.length) return quietMoves[Math.floor(Math.random() * quietMoves.length)];
    }
    return options[Math.floor(Math.random() * options.length)];
  }

  if (difficulty === 'medium') {
    const caps = options.filter((m) => findCapture(board, m.from, m.to));
    const pool = caps.length ? caps : options;
    pool.sort((a, b) => {
      const ca = Math.abs(a.to.c - 3.5) + Math.abs(a.to.r - 3.5);
      const cb = Math.abs(b.to.c - 3.5) + Math.abs(b.to.r - 3.5);
      return ca - cb;
    });
    const top = pool.slice(0, Math.min(3, pool.length));
    return top[Math.floor(Math.random() * top.length)];
  }

  // hard: 2-ply greedy
  let best = options[0];
  let bestScore = -Infinity;
  for (const m of options) {
    const after = applyBoardMove(board, m.from, m.to);
    const replies = allMoves(after, PLAYER);
    let worst = evalBoard(after);
    if (replies.length) {
      worst = Infinity;
      for (const r of replies.slice(0, 14)) {
        const after2 = applyBoardMove(after, r.from, r.to);
        const sc = evalBoard(after2);
        if (sc < worst) worst = sc;
      }
    }
    const captureBonus = findCapture(board, m.from, m.to) ? 0.9 : 0;
    const score = worst + captureBonus + Math.random() * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

export default function CheckersGame() {
  const { data: session } = useSession();
  const [board, setBoard] = useState(initialBoard);
  const [turn, setTurn] = useState<Side>(PLAYER);
  const [selected, setSelected] = useState<Pos | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => (typeof window !== 'undefined' ? getLocalBest('checkers') : 0));
  const [over, setOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('Выберите сложность и нажмите «Играть».');
  const [newRecord, setNewRecord] = useState(false);
  const [difficulty, setDifficulty] = useState<CheckersDifficulty>('medium');
  const [bestTime, setBestTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [hofKey, setHofKey] = useState(0);

  const startedAt = useRef(0);
  const playSessionRef = useRef<GameSessionCreds | null>(null);
  const scoreRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const aiTimerRef = useRef<number | null>(null);
  const difficultyRef = useRef(difficulty);
  const runningRef = useRef(false);
  const roundIdRef = useRef(0);

  useEffect(() => {
    difficultyRef.current = difficulty;
    setBestTime(getLocalBestTime('checkers', difficulty));
  }, [difficulty]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    if (!running || over) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = window.setInterval(() => {
      setElapsed(Date.now() - startedAt.current);
    }, 100);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [running, over]);

  useEffect(
    () => () => {
      if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    },
    []
  );

  const targets = useMemo(() => {
    if (!selected) return [] as Pos[];
    return movesFrom(board, selected);
  }, [board, selected]);

  const start = () => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    roundIdRef.current += 1;
    runningRef.current = true;
    setBoard(initialBoard());
    setTurn(PLAYER);
    setSelected(null);
    setScore(0);
    scoreRef.current = 0;
    setOver(false);
    setRunning(true);
    setNewRecord(false);
    setElapsed(0);
    startedAt.current = Date.now();
    setMsg('Вы — белые. Ходите первыми.');
    setBest(getLocalBest('checkers'));
    setBestTime(getLocalBestTime('checkers', difficultyRef.current));
    playSessionRef.current = null;
    void reportGameScore({ game: 'checkers', score: 0, event: 'play' });
    void beginGameSession('checkers').then((creds) => {
      playSessionRef.current = creds;
    });
  };

  const finish = async (won: boolean, pts: number) => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    runningRef.current = false;
    setOver(true);
    setRunning(false);
    const durationMs = Math.max(1, Date.now() - startedAt.current);
    setElapsed(durationMs);
    setScore(pts);
    scoreRef.current = pts;
    setBest((b) => Math.max(b, pts));
    const diff = difficultyRef.current;
    let isNew = false;
    if (won) {
      const prev = getLocalBestTime('checkers', diff);
      isNew = !prev || durationMs < prev;
      setLocalBestTime('checkers', durationMs, diff);
      setBestTime(getLocalBestTime('checkers', diff));
    }
    setNewRecord(isNew);
    setMsg(
      won
        ? isNew
          ? `Победа · ${formatDuration(durationMs)} · рекорд!`
          : `Победа · ${formatDuration(durationMs)}`
        : 'Поражение'
    );
    if (won) sfx.win();
    else sfx.die();
    const creds = await waitForPlaySession(() => playSessionRef.current);
    playSessionRef.current = null;
    await reportGameScore({
      game: 'checkers',
      score: pts,
      event: won ? 'win' : 'score',
      sessionId: creds?.sessionId,
      token: creds?.token,
      meta: {
        won,
        difficulty: diff,
        durationMs: won ? durationMs : undefined,
        bestTimes: won ? { [diff]: durationMs } : undefined,
      },
    });
    setHofKey((k) => k + 1);
  };

  const applyMove = (from: Pos, to: Pos) => {
    const cap = findCapture(board, from, to);
    const next = applyBoardMove(board, from, to);
    if (cap) {
      sfx.capture();
      setScore((s) => {
        const n = s + 15;
        scoreRef.current = n;
        return n;
      });
    } else {
      sfx.move();
    }

    if (cap) {
      const more = capturesFrom(next, to);
      if (more.length) {
        setBoard(next);
        setSelected(to);
        setMsg('Продолжайте рубку');
        return;
      }
    }

    setBoard(next);
    setSelected(null);

    const aiLeft = countSide(next, AI);
    const playerLeft = countSide(next, PLAYER);
    if (aiLeft === 0) {
      void finish(true, Math.max(scoreRef.current, 100 + playerLeft * 20));
      return;
    }
    if (playerLeft === 0) {
      void finish(false, scoreRef.current);
      return;
    }
    if (allMoves(next, AI).length === 0) {
      void finish(true, Math.max(scoreRef.current, 110 + playerLeft * 15));
      return;
    }

    setTurn(AI);
    setMsg('Ход соперника…');
    const delay = difficultyRef.current === 'hard' ? 280 : difficultyRef.current === 'easy' ? 450 : 360;
    const round = roundIdRef.current;
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    aiTimerRef.current = window.setTimeout(() => {
      if (roundIdRef.current !== round || !runningRef.current) return;
      aiMove(next);
      aiTimerRef.current = null;
    }, delay);
  };

  const aiMove = (current: Cell[][]) => {
    if (!runningRef.current) return;
    const pick = pickAiMove(current, difficultyRef.current);
    if (!pick) {
      void finish(true, Math.max(scoreRef.current, 120));
      return;
    }
    if (findCapture(current, pick.from, pick.to)) sfx.capture();
    else sfx.move();

    let next = applyBoardMove(current, pick.from, pick.to);
    let pos = pick.to;
    if (findCapture(current, pick.from, pick.to)) {
      let guard = 0;
      while (guard++ < 12) {
        const more = capturesFrom(next, pos);
        if (!more.length) break;
        const cont =
          difficultyRef.current === 'easy'
            ? more[Math.floor(Math.random() * more.length)]
            : more[0];
        next = applyBoardMove(next, pos, cont.to);
        pos = cont.to;
        sfx.capture();
      }
    }

    setBoard(next);
    const aiLeft = countSide(next, AI);
    const playerLeft = countSide(next, PLAYER);
    if (playerLeft === 0) {
      void finish(false, scoreRef.current);
      return;
    }
    if (aiLeft === 0) {
      void finish(true, Math.max(scoreRef.current, 100 + playerLeft * 20));
      return;
    }
    if (allMoves(next, PLAYER).length === 0) {
      void finish(false, scoreRef.current);
      return;
    }
    setTurn(PLAYER);
    setMsg('Ваш ход');
    setScore((s) => {
      const n = s + 5;
      scoreRef.current = n;
      return n;
    });
  };

  const onCell = (r: number, c: number) => {
    if (!runningRef.current || over || turn !== PLAYER) return;
    if (!isPlayableSquare(r, c)) return;
    const v = board[r][c];
    if (selected && targets.some((t) => t.r === r && t.c === c)) {
      applyMove(selected, { r, c });
      return;
    }
    // During multi-capture chain, piece is locked
    if (selected && capturesFrom(board, selected).length > 0) {
      return;
    }
    if (sideOf(v) === PLAYER) {
      sfx.tap();
      setSelected({ r, c });
      return;
    }
    setSelected(null);
  };

  const diffMeta = CHECKERS_DIFFICULTIES.find((d) => d.id === difficulty)!;

  return (
    <GameShell
      title="Шашки"
      viewId="checkers"
      accent="#b45309"
      className="is-checkers"
      score={score}
      best={best}
      bestTimeLabel={bestTime > 0 ? formatDuration(bestTime) : '—'}
      elapsedLabel={running || over ? formatDuration(elapsed) : '—'}
      over={over}
      running={running}
      onStart={start}
      newRecord={newRecord}
      status={msg}
      hint="Русские шашки: белые снизу, рубка обязательна, дамка ходит по всей диагонали."
      pcHint="Клик мышью · полный экран удобен на большом мониторе"
      extra={
        <div className={`game-extra-stable${running ? ' is-reserved' : ''}`} aria-hidden={running}>
          <div className="game-diff-picker" role="group" aria-label="Сложность">
            {CHECKERS_DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`game-diff-btn${difficulty === d.id ? ' is-active' : ''}`}
                onClick={() => setDifficulty(d.id)}
                disabled={running}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="game-diff-hint">{diffMeta.hint} · рекорд на время в таблице почёта</p>
        </div>
      }
      footer={
        <GameHallOfFame
          key={hofKey}
          game="checkers"
          difficulty={difficulty}
          onDifficultyChange={running ? undefined : setDifficulty}
          compact
          topN={3}
          currentUserId={(session?.user as { id?: string } | undefined)?.id}
        />
      }
    >
      <div className="checkers-board-frame">
        <div className="checkers-board" role="grid" aria-label="Доска шашек">
          {board.map((row, r) =>
            row.map((v, c) => {
              const darkSq = (r + c) % 2 === 1;
              const isSel = selected?.r === r && selected?.c === c;
              const isT = targets.some((t) => t.r === r && t.c === c);
              const side = sideOf(v);
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  className={`checkers-cell ${darkSq ? 'dark' : 'light'}${isSel ? ' sel' : ''}${isT ? ' dest' : ''}`}
                  onClick={() => onCell(r, c)}
                  aria-label={`Клетка ${r + 1}-${c + 1}`}
                >
                  {v > 0 && side ? (
                    <span className={`checkers-piece ${side === 'dark' ? 'b' : 'w'}${isKing(v) ? ' king' : ''}`} />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </GameShell>
  );
}
