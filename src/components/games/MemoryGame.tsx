'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { beginGameSession, getLocalBest, reportGameScore, waitForPlaySession, type GameSessionCreds } from '@/lib/game-scores-client';
import GameShell from '@/components/games/GameShell';
import GameHallOfFame from '@/components/games/GameHallOfFame';
import { sfx } from '@/lib/game-sfx';

const ICONS = ['🌊', '☀️', '🏔', '🎭', '⚽', '🎸', '🚀', '🌿'];

type Card = { id: number; icon: string; matched: boolean };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function makeDeck(): Card[] {
  return shuffle(
    ICONS.flatMap((icon, i) => [
      { id: i * 2, icon, matched: false },
      { id: i * 2 + 1, icon, matched: false },
    ])
  );
}

export default function MemoryGame() {
  const { data: session } = useSession();
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const [cards, setCards] = useState<Card[]>(() => makeDeck());
  const [flipped, setFlipped] = useState<number[]>([]);
  const [lock, setLock] = useState(false);
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  const [hofKey, setHofKey] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [combo, setCombo] = useState(0);
  const [matchedPairs, setMatchedPairs] = useState(0);

  const runningRef = useRef(false);
  const overRef = useRef(false);
  const lockRef = useRef(false);
  const flippedRef = useRef<number[]>([]);
  const cardsRef = useRef<Card[]>(cards);
  const comboRef = useRef(0);
  const scoreRef = useRef(0);
  const movesRef = useRef(0);
  const startedAtRef = useRef(0);
  const playSessionRef = useRef<GameSessionCreds | null>(null);
  const roundIdRef = useRef(0);
  const mismatchTimerRef = useRef<number | null>(null);

  useEffect(() => setBest(getLocalBest('memory')), []);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    overRef.current = over;
  }, [over]);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    if (!running || over) return;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAtRef.current), 250);
    return () => window.clearInterval(id);
  }, [running, over]);

  useEffect(
    () => () => {
      if (mismatchTimerRef.current) window.clearTimeout(mismatchTimerRef.current);
    },
    []
  );

  const clearMismatchTimer = () => {
    if (mismatchTimerRef.current) {
      window.clearTimeout(mismatchTimerRef.current);
      mismatchTimerRef.current = null;
    }
  };

  const finish = useCallback(async (finalScore: number) => {
    runningRef.current = false;
    overRef.current = true;
    setOver(true);
    setRunning(false);
    setLock(false);
    lockRef.current = false;
    const prev = getLocalBest('memory');
    const isNew = finalScore > prev && finalScore > 0;
    setNewRecord(isNew);
    setBest((b) => Math.max(b, finalScore));
    if (isNew) sfx.win();
    else sfx.bonus();
    const creds = await waitForPlaySession(() => playSessionRef.current);
    playSessionRef.current = null;
    await reportGameScore({
      game: 'memory',
      score: finalScore,
      sessionId: creds?.sessionId,
      token: creds?.token,
    });
    setHofKey((k) => k + 1);
  }, []);

  const start = useCallback(() => {
    clearMismatchTimer();
    roundIdRef.current += 1;
    const deck = makeDeck();
    cardsRef.current = deck;
    flippedRef.current = [];
    lockRef.current = false;
    comboRef.current = 0;
    scoreRef.current = 0;
    movesRef.current = 0;
    startedAtRef.current = Date.now();
    runningRef.current = true;
    overRef.current = false;

    setCards(deck);
    setFlipped([]);
    setLock(false);
    setMoves(0);
    setScore(0);
    setCombo(0);
    setMatchedPairs(0);
    setOver(false);
    setNewRecord(false);
    setStartedAt(startedAtRef.current);
    setElapsed(0);
    playSessionRef.current = null;
    setRunning(true);
    void beginGameSession('memory').then((creds) => {
      playSessionRef.current = creds;
    });
  }, []);

  const onCard = (idx: number) => {
    if (!runningRef.current || overRef.current || lockRef.current) return;
    const deck = cardsRef.current;
    if (!deck[idx] || deck[idx].matched) return;
    if (flippedRef.current.includes(idx)) return;

    sfx.tap();
    const nextFlipped = [...flippedRef.current, idx];
    flippedRef.current = nextFlipped;
    setFlipped(nextFlipped);
    if (nextFlipped.length < 2) return;

    // Pair check — lock immediately so rapid taps cannot race
    lockRef.current = true;
    setLock(true);
    movesRef.current += 1;
    setMoves(movesRef.current);

    const [a, b] = nextFlipped;
    const ca = deck[a];
    const cb = deck[b];
    const round = roundIdRef.current;

    if (ca && cb && ca.icon === cb.icon) {
      comboRef.current += 1;
      const nextCombo = comboRef.current;
      const gain = 50 + nextCombo * 15;
      scoreRef.current += gain;
      setCombo(nextCombo);
      setScore(scoreRef.current);
      sfx.eat();
      if (nextCombo >= 2) sfx.combo(Math.min(4, nextCombo));

      const updated = deck.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c));
      cardsRef.current = updated;
      setCards(updated);
      flippedRef.current = [];
      setFlipped([]);
      lockRef.current = false;
      setLock(false);

      const pairs = updated.filter((c) => c.matched).length / 2;
      setMatchedPairs(pairs);

      if (updated.every((c) => c.matched)) {
        const elapsedMs = Date.now() - startedAtRef.current;
        const timeBonus = Math.max(0, 1800 - Math.floor(elapsedMs / 50));
        const movePenalty = Math.max(0, movesRef.current - 16) * 8;
        const finalScore = Math.max(0, scoreRef.current + timeBonus - movePenalty);
        scoreRef.current = finalScore;
        setScore(finalScore);
        void finish(finalScore);
      }
      return;
    }

    comboRef.current = 0;
    setCombo(0);
    sfx.move();
    clearMismatchTimer();
    mismatchTimerRef.current = window.setTimeout(() => {
      if (roundIdRef.current !== round) return;
      flippedRef.current = [];
      setFlipped([]);
      lockRef.current = false;
      setLock(false);
      mismatchTimerRef.current = null;
    }, 700);
  };

  const beginOrRestart = () => {
    sfx.unlock();
    sfx.start();
    start();
  };

  const preview = !running && !over;

  return (
    <GameShell
      title="Память"
      viewId="memory"
      accent="#a855f7"
      score={score}
      best={best}
      over={over}
      running={running}
      onStart={beginOrRestart}
      combo={combo}
      newRecord={newRecord}
      elapsedLabel={running || over ? formatMs(elapsed) : '—'}
      hint="Тап — старт · найди 8 пар"
      pcHint="Клик по карточке · полный экран на ПК"
      showComboSlot
      status={running ? `Пары ${matchedPairs}/8 · ходы ${moves}` : undefined}
      footer={
        <GameHallOfFame
          key={hofKey}
          game="memory"
          compact
          topN={3}
          currentUserId={(session?.user as { id?: string } | undefined)?.id}
        />
      }
      controls={null}
    >
      <div
        className={`memory-board${preview ? ' is-preview' : ''}${over ? ' is-over' : ''}`}
        role="grid"
        aria-label="Карточки памяти"
        onClick={() => {
          if (!running || over) beginOrRestart();
        }}
      >
        {cards.map((card, idx) => {
          const open = flipped.includes(idx) || card.matched || over;
          const canFlip = running && !over && !card.matched && !lock;
          return (
            <button
              key={card.id}
              type="button"
              className={`memory-card${open ? ' is-open' : ''}${card.matched ? ' is-matched' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!running || over) {
                  beginOrRestart();
                  return;
                }
                onCard(idx);
              }}
              disabled={running && !over ? card.matched || (lock && !flipped.includes(idx)) : false}
              aria-label={
                !running || over
                  ? 'Начать игру'
                  : open
                    ? `Открыто: ${card.icon}`
                    : canFlip
                      ? 'Закрытая карточка'
                      : 'Карточка'
              }
            >
              <span className="memory-card-inner">
                <span className="memory-card-face memory-card-front" aria-hidden>
                  {card.icon}
                </span>
                <span className="memory-card-face memory-card-back" aria-hidden>
                  ◆
                </span>
              </span>
            </button>
          );
        })}
        {preview ? (
          <div className="memory-board-hint" aria-hidden>
            <strong>Нажмите, чтобы начать</strong>
            <span>Найди все пары · комбо за серии</span>
          </div>
        ) : null}
      </div>
    </GameShell>
  );
}
