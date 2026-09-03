'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { beginGameSession, getLocalBest, reportGameScore, waitForPlaySession, type GameSessionCreds } from '@/lib/game-scores-client';
import GameShell, { GamePadButton } from '@/components/games/GameShell';
import GameHallOfFame from '@/components/games/GameHallOfFame';
import { createFixedStepper, setupHiDpiCanvas } from '@/lib/game-canvas';
import { formatDuration } from '@/lib/game-meta';
import { sfx } from '@/lib/game-sfx';

const CELL = 18;
const COLS = 16;
const ROWS = 22;
const SPEED0 = 145;

type Pt = { x: number; y: number };
type FoodKind = 'normal' | 'gold' | 'chill';
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, rr);
  } else {
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  ctx.fill();
}

function pickFoodKind(): FoodKind {
  const r = Math.random();
  if (r < 0.12) return 'gold';
  if (r < 0.22) return 'chill';
  return 'normal';
}

export default function SnakeGame() {
  const { data: session } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [combo, setCombo] = useState(0);
  const [level, setLevel] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [chill, setChill] = useState(false);
  const [newRecord, setNewRecord] = useState(false);
  const [hofKey, setHofKey] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const playSessionRef = useRef<GameSessionCreds | null>(null);

  const dirRef = useRef<Pt>({ x: 1, y: 0 });
  const nextDirRef = useRef<Pt>({ x: 1, y: 0 });
  const snakeRef = useRef<Pt[]>([
    { x: 4, y: 11 },
    { x: 3, y: 11 },
    { x: 2, y: 11 },
  ]);
  const foodRef = useRef<{ pos: Pt; kind: FoodKind }>({ pos: { x: 10, y: 11 }, kind: 'normal' });
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const missStreakRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const chillUntilRef = useRef(0);
  const pulseRef = useRef(0);
  const pausedRef = useRef(false);
  const runningRef = useRef(false);
  const stepperRef = useRef(createFixedStepper(SPEED0));
  const prevSnakeRef = useRef<Pt[]>([]);
  const interpRef = useRef(0);

  useEffect(() => {
    setBest(getLocalBest('snake'));
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    if (!running || over || paused) return;
    const id = window.setInterval(() => {
      const e = Date.now() - startedAtRef.current;
      elapsedRef.current = e;
      setElapsed(e);
    }, 250);
    return () => window.clearInterval(id);
  }, [running, over, paused]);

  const flash = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1100);
  }, []);

  const burst = useCallback((cx: number, cy: number, color: string, n = 10) => {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const sp = 1.2 + Math.random() * 2.4;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        color,
        size: 2 + Math.random() * 2.5,
      });
    }
  }, []);

  const placeFood = useCallback(() => {
    const occupied = new Set(snakeRef.current.map((p) => `${p.x},${p.y}`));
    let p: Pt;
    do {
      p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (occupied.has(`${p.x},${p.y}`));
    foodRef.current = { pos: p, kind: pickFoodKind() };
  }, []);

  const draw = useCallback((alpha = 1) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const logicalW = COLS * CELL;
    const logicalH = ROWS * CELL;
    pulseRef.current += 0.06;

    const g = ctx.createLinearGradient(0, 0, 0, logicalH);
    g.addColorStop(0, '#0b1220');
    g.addColorStop(1, '#020617');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, logicalW, logicalH);

    ctx.strokeStyle = 'rgba(148,163,184,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, logicalH);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(logicalW, y * CELL + 0.5);
      ctx.stroke();
    }

    const food = foodRef.current;
    const pulse = 0.5 + Math.sin(pulseRef.current) * 0.5;
    if (food.kind === 'gold') {
      ctx.shadowColor = `rgba(250,204,21,${0.35 + pulse * 0.35})`;
      ctx.shadowBlur = 14 + pulse * 8;
      ctx.fillStyle = '#fbbf24';
      fillRoundRect(ctx, food.pos.x * CELL + 2, food.pos.y * CELL + 2, CELL - 4, CELL - 4, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      fillRoundRect(ctx, food.pos.x * CELL + 5, food.pos.y * CELL + 5, 5, 5, 2);
    } else if (food.kind === 'chill') {
      ctx.shadowColor = `rgba(56,189,248,${0.35 + pulse * 0.3})`;
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#38bdf8';
      fillRoundRect(ctx, food.pos.x * CELL + 3, food.pos.y * CELL + 3, CELL - 6, CELL - 6, 8);
    } else {
      ctx.shadowColor = `rgba(244,63,94,${0.35 + pulse * 0.25})`;
      ctx.shadowBlur = 10 + pulse * 4;
      ctx.fillStyle = '#fb7185';
      fillRoundRect(ctx, food.pos.x * CELL + 3, food.pos.y * CELL + 3, CELL - 6, CELL - 6, 6);
    }
    ctx.shadowBlur = 0;

    const curr = snakeRef.current;
    const prev = prevSnakeRef.current.length === curr.length ? prevSnakeRef.current : curr;
    const t = Math.max(0, Math.min(1, alpha));
    curr.forEach((p, i) => {
      const q = prev[i] || p;
      const x = q.x + (p.x - q.x) * t;
      const y = q.y + (p.y - q.y) * t;
      const k = i / Math.max(1, curr.length);
      if (i === 0) {
        ctx.fillStyle = '#bbf7d0';
        ctx.shadowColor = 'rgba(34,197,94,0.4)';
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = `rgba(34,197,94,${1 - k * 0.55})`;
        ctx.shadowBlur = 0;
      }
      fillRoundRect(ctx, x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4, 5);
      ctx.shadowBlur = 0;
      if (i === 0) {
        ctx.fillStyle = '#0f172a';
        const eye = 2.2;
        const ox = dirRef.current.x !== 0 ? dirRef.current.x * 3 : 0;
        const oy = dirRef.current.y !== 0 ? dirRef.current.y * 3 : 0;
        ctx.beginPath();
        ctx.arc(x * CELL + CELL / 2 - 3 + ox, y * CELL + CELL / 2 - 2 + oy, eye, 0, Math.PI * 2);
        ctx.arc(x * CELL + CELL / 2 + 3 + ox, y * CELL + CELL / 2 - 2 + oy, eye, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    for (const p of particlesRef.current) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (pausedRef.current && runningRef.current) {
      ctx.fillStyle = 'rgba(2,6,23,0.45)';
      ctx.fillRect(0, 0, logicalW, logicalH);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 16px Outfit, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Пауза', logicalW / 2, logicalH / 2);
    }
  }, []);

  const endGame = useCallback(async () => {
    runningRef.current = false;
    setOver(true);
    setRunning(false);
    setPaused(false);
    sfx.die();
    const s = scoreRef.current;
    const prevBest = getLocalBest('snake');
    const isNew = s > prevBest && s > 0;
    setNewRecord(isNew);
    setBest((b) => Math.max(b, s));
    if (isNew) sfx.win();
    const creds = await waitForPlaySession(() => playSessionRef.current);
    playSessionRef.current = null;
    await reportGameScore({
      game: 'snake',
      score: s,
      sessionId: creds?.sessionId,
      token: creds?.token,
    });
    setHofKey((k) => k + 1);
  }, []);

  const step = useCallback(() => {
    if (pausedRef.current || !runningRef.current) return;
    prevSnakeRef.current = snakeRef.current.map((p) => ({ ...p }));
    dirRef.current = nextDirRef.current;
    const dir = dirRef.current;
    const head = snakeRef.current[0];
    const next = { x: head.x + dir.x, y: head.y + dir.y };
    if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS) {
      void endGame();
      return;
    }
    if (snakeRef.current.some((p) => p.x === next.x && p.y === next.y)) {
      void endGame();
      return;
    }
    const food = foodRef.current;
    const grew = next.x === food.pos.x && next.y === food.pos.y;
    snakeRef.current = [next, ...snakeRef.current];
    if (grew) {
      comboRef.current += 1;
      missStreakRef.current = 0;
      setCombo(comboRef.current);
      const mult = Math.min(4, 1 + Math.floor((comboRef.current - 1) / 3));
      let base = 10;
      let color = '#fb7185';
      if (food.kind === 'gold') {
        base = 35;
        color = '#fbbf24';
        flash(mult > 1 ? `Золото ×${mult}!` : 'Золотое яблоко!');
        sfx.bonus();
      } else if (food.kind === 'chill') {
        base = 15;
        color = '#38bdf8';
        chillUntilRef.current = Date.now() + 3500;
        setChill(true);
        window.setTimeout(() => setChill(false), 3600);
        flash('Замедление');
        sfx.chill();
      } else {
        sfx.eat();
        if (comboRef.current >= 3 && comboRef.current % 3 === 0) {
          flash(`Комбо ×${mult}`);
          sfx.combo(mult);
        }
      }
      const gained = base * mult;
      scoreRef.current += gained;
      setScore(scoreRef.current);
      setLevel(1 + Math.floor(scoreRef.current / 80));
      burst(next.x * CELL + CELL / 2, next.y * CELL + CELL / 2, color, food.kind === 'gold' ? 16 : 10);
      placeFood();
      const chillOn = Date.now() < chillUntilRef.current;
      const baseSpeed = Math.max(58, SPEED0 - Math.floor(scoreRef.current / 40) * 7);
      stepperRef.current.setStepMs(chillOn ? Math.round(baseSpeed * 1.45) : baseSpeed);
    } else {
      snakeRef.current.pop();
      missStreakRef.current += 1;
      if (missStreakRef.current > 18 && comboRef.current > 0) {
        comboRef.current = 0;
        setCombo(0);
      }
    }
    interpRef.current = 0;
  }, [burst, endGame, flash, placeFood]);

  const setDir = (nd: Pt) => {
    if (pausedRef.current) return;
    const d = nextDirRef.current;
    if (nd.x === -d.x && nd.y === -d.y) return;
    nextDirRef.current = nd;
    sfx.move();
  };

  const fitSnakeCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement;
    if (!parent) {
      setupHiDpiCanvas(c, COLS * CELL, ROWS * CELL, 1);
      return;
    }
    const maxW = parent.clientWidth;
    const maxH = parent.clientHeight || ROWS * CELL;
    const scale = Math.min(maxW / (COLS * CELL), maxH / (ROWS * CELL), 2.4);
    setupHiDpiCanvas(c, COLS * CELL * scale, ROWS * CELL * scale, scale);
  }, []);

  const start = () => {
    snakeRef.current = [
      { x: 4, y: 11 },
      { x: 3, y: 11 },
      { x: 2, y: 11 },
    ];
    prevSnakeRef.current = snakeRef.current.map((p) => ({ ...p }));
    dirRef.current = { x: 1, y: 0 };
    nextDirRef.current = { x: 1, y: 0 };
    scoreRef.current = 0;
    comboRef.current = 0;
    missStreakRef.current = 0;
    particlesRef.current = [];
    chillUntilRef.current = 0;
    stepperRef.current.setStepMs(SPEED0);
    stepperRef.current.reset();
    setScore(0);
    setCombo(0);
    setLevel(1);
    setOver(false);
    setPaused(false);
    setNewRecord(false);
    setChill(false);
    setToast(null);
    startedAtRef.current = Date.now();
    elapsedRef.current = 0;
    setElapsed(0);
    placeFood();
    fitSnakeCanvas();
    draw(1);
    playSessionRef.current = null;
    setRunning(true);
    void beginGameSession('snake').then((creds) => {
      playSessionRef.current = creds;
    });
  };

  const togglePause = () => {
    if (!running || over) return;
    setPaused((p) => {
      if (!p) {
        const e = Date.now() - startedAtRef.current;
        elapsedRef.current = e;
        setElapsed(e);
      } else {
        startedAtRef.current = Date.now() - elapsedRef.current;
      }
      return !p;
    });
    sfx.tap();
  };

  useEffect(() => {
    fitSnakeCanvas();
    const onResize = () => fitSnakeCanvas();
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' && canvasRef.current?.parentElement
      ? new ResizeObserver(onResize)
      : null;
    if (canvasRef.current?.parentElement) ro?.observe(canvasRef.current.parentElement);

    const loop = (now: number) => {
      let alpha = 1;
      if (runningRef.current && !pausedRef.current) {
        const chillOn = Date.now() < chillUntilRef.current;
        const baseSpeed = Math.max(58, SPEED0 - Math.floor(scoreRef.current / 40) * 7);
        stepperRef.current.setStepMs(chillOn ? Math.round(baseSpeed * 1.45) : baseSpeed);
        const dt = stepperRef.current.advance(now, step);
        interpRef.current = Math.min(1, interpRef.current + dt * (1000 / stepperRef.current.stepMs));
        alpha = interpRef.current;
        for (const p of particlesRef.current) {
          p.x += p.vx * (dt * 60);
          p.y += p.vy * (dt * 60);
          p.vy += 0.06 * (dt * 60);
          p.life *= Math.pow(0.92, dt * 60);
        }
        particlesRef.current = particlesRef.current.filter((p) => p.life > 0.05);
      } else {
        stepperRef.current.reset(now);
      }
      draw(alpha);
      rafRef.current = window.requestAnimationFrame(loop);
    };
    rafRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [draw, fitSnakeCanvas, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Escape') {
        if (running) {
          e.preventDefault();
          togglePause();
        }
        return;
      }
      const map: Record<string, Pt> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
      };
      const nd = map[e.key];
      if (!nd) return;
      e.preventDefault();
      setDir(nd);
    };
    window.addEventListener('keydown', onKey, { passive: false });
    return () => window.removeEventListener('keydown', onKey);
  });

  const swipe = (dx: number, dy: number) => {
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
    else setDir(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
  };

  return (
    <GameShell
      title="Змейка"
      viewId="snake"
      accent="#22c55e"
      score={score}
      best={best}
      over={over}
      running={running}
      paused={paused}
      onStart={start}
      onPause={togglePause}
      level={level}
      combo={combo}
      newRecord={newRecord}
      status={toast || undefined}
      hint="Тап по полю — старт · свайп — ход"
      pcHint="WASD / стрелки · пробел — пауза · полный экран на ПК"
      showLevelSlot
      showComboSlot
      elapsedLabel={running || over ? formatDuration(elapsed) : '—'}
      footer={
        <GameHallOfFame
          key={hofKey}
          game="snake"
          compact
          topN={3}
          currentUserId={(session?.user as { id?: string } | undefined)?.id}
        />
      }
      controls={
        <div className="game-pad is-snake" aria-label="Управление" aria-hidden={!running && !over}>
          <GamePadButton className="up" label="↑" ariaLabel="Вверх" onPress={() => setDir({ x: 0, y: -1 })} />
          <GamePadButton className="left" label="←" ariaLabel="Влево" onPress={() => setDir({ x: -1, y: 0 })} />
          <GamePadButton className="down" label="↓" ariaLabel="Вниз" onPress={() => setDir({ x: 0, y: 1 })} />
          <GamePadButton className="right" label="→" ariaLabel="Вправо" onPress={() => setDir({ x: 1, y: 0 })} />
        </div>
      }
    >
      <div className="game-canvas-wrap is-snake">
        <canvas
          ref={canvasRef}
          onClick={() => {
            if (!running && !over) {
              sfx.unlock();
              sfx.start();
              start();
            }
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            const t = e.touches[0];
            const el = e.currentTarget as HTMLCanvasElement & { _tx?: number; _ty?: number; _t0?: number };
            el._tx = t.clientX;
            el._ty = t.clientY;
            el._t0 = Date.now();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            const t = e.changedTouches[0];
            const el = e.currentTarget as HTMLCanvasElement & { _tx?: number; _ty?: number; _t0?: number };
            const dx = t.clientX - (el._tx || 0);
            const dy = t.clientY - (el._ty || 0);
            if (!running && !over) {
              if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
                sfx.unlock();
                sfx.start();
                start();
              }
              return;
            }
            swipe(dx, dy);
          }}
        />
        {!running && !over ? (
          <div className="game-canvas-hint">
            <strong>Нажмите на поле</strong>
            <span>Свайп — управление · красное — очки · жёлтое — бонус</span>
          </div>
        ) : null}
      </div>
    </GameShell>
  );
}
