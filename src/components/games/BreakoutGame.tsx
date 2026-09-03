'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { beginGameSession, getLocalBest, reportGameScore, waitForPlaySession, type GameSessionCreds } from '@/lib/game-scores-client';
import GameShell, { GamePadButton } from '@/components/games/GameShell';
import GameHallOfFame from '@/components/games/GameHallOfFame';
import { fitCanvasInBox } from '@/lib/game-canvas';
import { formatDuration } from '@/lib/game-meta';
import { sfx } from '@/lib/game-sfx';

const W = 420;
const H = 560;
const PADDLE_W0 = 86;
const PADDLE_H = 12;
const BALL_R = 7;
const ROWS = 7;
const COLS = 10;
const BRICK_GAP = 4;
const PHYS_SUBSTEPS = 3;

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

type Brick = { x: number; y: number; w: number; h: number; hp: number; pts: number; hue: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
type Trail = { x: number; y: number; life: number };

export default function BreakoutGame() {
  const { data: session } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [newRecord, setNewRecord] = useState(false);
  const [hofKey, setHofKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [ballStuck, setBallStuck] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const playSessionRef = useRef<GameSessionCreds | null>(null);

  const paddleX = useRef(W / 2 - PADDLE_W0 / 2);
  const paddleW = useRef(PADDLE_W0);
  const paddleTarget = useRef(W / 2 - PADDLE_W0 / 2);
  const ball = useRef({ x: W / 2, y: H - 60, vx: 0, vy: 0, stuck: true });
  const bricks = useRef<Brick[]>([]);
  const particles = useRef<Particle[]>([]);
  const trail = useRef<Trail[]>([]);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const levelRef = useRef(1);
  const comboRef = useRef(0);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTs = useRef(0);
  const keys = useRef({ left: false, right: false });
  const scoreDirty = useRef(false);
  const livesDirty = useRef(false);
  const hudSync = useRef(0);

  useEffect(() => setBest(getLocalBest('breakout')), []);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!running || over || paused) return;
    const id = window.setInterval(() => {
      const e = Date.now() - startedAtRef.current;
      elapsedRef.current = e;
      setElapsed(e);
    }, 250);
    return () => window.clearInterval(id);
  }, [running, over, paused]);

  const burst = (cx: number, cy: number, color: string, n = 8) => {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = 40 + Math.random() * 120;
      particles.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        color,
        size: 1.6 + Math.random() * 2.2,
      });
    }
  };

  const buildBricks = useCallback((lv: number) => {
    const top = 52;
    const bw = (W - BRICK_GAP * (COLS + 1)) / COLS;
    const bh = 15;
    const list: Brick[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const hp = r < 2 ? 2 : r < 4 && lv > 2 ? 2 : 1;
        list.push({
          x: BRICK_GAP + c * (bw + BRICK_GAP),
          y: top + r * (bh + BRICK_GAP),
          w: bw,
          h: bh,
          hp,
          pts: (hp + Math.floor(lv / 2)) * 12,
          hue: (12 + r * 26 + lv * 10) % 360,
        });
      }
    }
    bricks.current = list;
  }, []);

  const resize = useCallback(() => {
    const c = canvasRef.current;
    const box = wrapRef.current;
    if (!c || !box) return;
    fitCanvasInBox(c, W, H, box.clientWidth, box.clientHeight, 6);
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0f172a');
    g.addColorStop(0.55, '#0b1220');
    g.addColorStop(1, '#020617');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // subtle vignette
    const vg = ctx.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.5, W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    for (const b of bricks.current) {
      if (b.hp <= 0) continue;
      ctx.fillStyle = `hsl(${b.hue} 82% ${b.hp > 1 ? 56 : 46}%)`;
      ctx.shadowColor = `hsla(${b.hue},85%,55%,0.4)`;
      ctx.shadowBlur = 6;
      fillRoundRect(ctx, b.x, b.y, b.w, b.h, 5);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      fillRoundRect(ctx, b.x + 2, b.y + 2, b.w - 4, Math.max(2, b.h * 0.28), 3);
      if (b.hp > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, 2.5);
      }
    }

    // ball trail
    for (const t of trail.current) {
      ctx.globalAlpha = t.life * 0.45;
      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.arc(t.x, t.y, BALL_R * (0.45 + t.life * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const p of particles.current) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#f8fafc';
    ctx.shadowColor = 'rgba(248,250,252,0.35)';
    ctx.shadowBlur = 12;
    fillRoundRect(ctx, paddleX.current, H - 28, paddleW.current, PADDLE_H, 7);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(239,68,68,0.85)';
    fillRoundRect(ctx, paddleX.current + 6, H - 24, paddleW.current - 12, 3, 2);

    const bl = ball.current;
    ctx.fillStyle = '#fecdd3';
    ctx.shadowColor = 'rgba(251,113,133,0.65)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(bl.x, bl.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(bl.x - 2, bl.y - 2.5, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 13px Outfit, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`❤ ${livesRef.current}`, 12, 24);
    if (comboRef.current > 1) {
      ctx.fillStyle = '#fde68a';
      ctx.textAlign = 'right';
      ctx.fillText(`×${comboRef.current}`, W - 12, 24);
    }

    if (pausedRef.current && runningRef.current) {
      ctx.fillStyle = 'rgba(2,6,23,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 20px Outfit, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Пауза', W / 2, H / 2);
    }
  }, []);

  const endGame = useCallback(async () => {
    runningRef.current = false;
    setOver(true);
    setRunning(false);
    setPaused(false);
    sfx.die();
    const s = scoreRef.current;
    const prev = getLocalBest('breakout');
    const isNew = s > prev && s > 0;
    setNewRecord(isNew);
    setBest((b) => Math.max(b, s));
    if (isNew) sfx.win();
    const creds = await waitForPlaySession(() => playSessionRef.current);
    playSessionRef.current = null;
    await reportGameScore({
      game: 'breakout',
      score: s,
      sessionId: creds?.sessionId,
      token: creds?.token,
    });
    setHofKey((k) => k + 1);
  }, []);

  const launch = () => {
    const bl = ball.current;
    if (!bl.stuck) return;
    bl.stuck = false;
    setBallStuck(false);
    const angle = -Math.PI / 2 + (Math.random() * 0.5 - 0.25);
    const speed = 300 + levelRef.current * 16;
    bl.vx = Math.cos(angle) * speed;
    bl.vy = Math.sin(angle) * speed;
    comboRef.current = 0;
    sfx.tap();
  };

  const collideBrick = (bl: typeof ball.current, b: Brick) => {
    const overlapL = bl.x + BALL_R - b.x;
    const overlapR = b.x + b.w - (bl.x - BALL_R);
    const overlapT = bl.y + BALL_R - b.y;
    const overlapB = b.y + b.h - (bl.y - BALL_R);
    const minX = Math.min(overlapL, overlapR);
    const minY = Math.min(overlapT, overlapB);
    if (minX < minY) {
      bl.vx *= -1;
      bl.x += bl.vx > 0 ? minX : -minX;
    } else {
      bl.vy *= -1;
      bl.y += bl.vy > 0 ? minY : -minY;
    }
    b.hp -= 1;
    if (b.hp <= 0) {
      comboRef.current += 1;
      const bonus = Math.min(4, comboRef.current);
      scoreRef.current += b.pts * bonus;
      scoreDirty.current = true;
      burst(b.x + b.w / 2, b.y + b.h / 2, `hsl(${b.hue} 85% 60%)`, 10);
      sfx.eat();
    } else {
      sfx.move();
      burst(bl.x, bl.y, `hsl(${b.hue} 70% 70%)`, 4);
    }
  };

  const tick = useCallback(
    (ts: number) => {
      const dt = Math.min(0.033, (ts - (lastTs.current || ts)) / 1000);
      lastTs.current = ts;

      if (runningRef.current && !pausedRef.current) {
        const paddleSpeed = 520;
        if (keys.current.left) paddleTarget.current -= paddleSpeed * dt;
        if (keys.current.right) paddleTarget.current += paddleSpeed * dt;
        paddleTarget.current = Math.max(0, Math.min(W - paddleW.current, paddleTarget.current));
        // smooth follow for mouse/touch target
        paddleX.current += (paddleTarget.current - paddleX.current) * Math.min(1, 18 * dt);
        paddleX.current = Math.max(0, Math.min(W - paddleW.current, paddleX.current));

        const bl = ball.current;
        if (bl.stuck) {
          bl.x = paddleX.current + paddleW.current / 2;
          bl.y = H - 28 - BALL_R - 2;
          trail.current = [];
        } else {
          const stepDt = dt / PHYS_SUBSTEPS;
          for (let s = 0; s < PHYS_SUBSTEPS; s++) {
            bl.x += bl.vx * stepDt;
            bl.y += bl.vy * stepDt;

            if (bl.x < BALL_R) {
              bl.x = BALL_R;
              bl.vx = Math.abs(bl.vx);
              sfx.move();
            } else if (bl.x > W - BALL_R) {
              bl.x = W - BALL_R;
              bl.vx = -Math.abs(bl.vx);
              sfx.move();
            }
            if (bl.y < BALL_R + 28) {
              bl.y = BALL_R + 28;
              bl.vy = Math.abs(bl.vy);
              sfx.move();
            }

            const py = H - 28;
            if (
              bl.vy > 0 &&
              bl.y + BALL_R >= py &&
              bl.y - BALL_R <= py + PADDLE_H &&
              bl.x >= paddleX.current - 3 &&
              bl.x <= paddleX.current + paddleW.current + 3
            ) {
              const hit = (bl.x - (paddleX.current + paddleW.current / 2)) / (paddleW.current / 2);
              const ang = -Math.PI / 2 + Math.max(-1, Math.min(1, hit)) * 1.15;
              const sp = Math.min(560, Math.max(280, Math.hypot(bl.vx, bl.vy) * 1.015 + 4));
              bl.vx = Math.cos(ang) * sp;
              bl.vy = Math.sin(ang) * sp;
              bl.y = py - BALL_R - 1;
              comboRef.current = 0;
              sfx.tap();
            }

            for (const b of bricks.current) {
              if (b.hp <= 0) continue;
              if (
                bl.x + BALL_R > b.x &&
                bl.x - BALL_R < b.x + b.w &&
                bl.y + BALL_R > b.y &&
                bl.y - BALL_R < b.y + b.h
              ) {
                collideBrick(bl, b);
                break;
              }
            }
          }

          trail.current.push({ x: bl.x, y: bl.y, life: 1 });
          if (trail.current.length > 12) trail.current.shift();
          for (const t of trail.current) t.life *= 0.86;
          trail.current = trail.current.filter((t) => t.life > 0.08);

          if (bricks.current.every((b) => b.hp <= 0)) {
            levelRef.current += 1;
            setLevel(levelRef.current);
            paddleW.current = Math.max(54, PADDLE_W0 - (levelRef.current - 1) * 3.5);
            paddleTarget.current = Math.min(paddleTarget.current, W - paddleW.current);
            buildBricks(levelRef.current);
            bl.stuck = true;
            setBallStuck(true);
            bl.vx = 0;
            bl.vy = 0;
            comboRef.current = 0;
            setToast(`Уровень ${levelRef.current}`);
            sfx.win();
            window.setTimeout(() => setToast(null), 1000);
          }

          if (bl.y > H + 24) {
            livesRef.current -= 1;
            livesDirty.current = true;
            comboRef.current = 0;
            if (livesRef.current <= 0) {
              void endGame();
            } else {
              bl.stuck = true;
              setBallStuck(true);
              bl.vx = 0;
              bl.vy = 0;
              sfx.die();
            }
          }
        }

        for (const p of particles.current) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 180 * dt;
          p.life -= dt * 1.8;
        }
        particles.current = particles.current.filter((p) => p.life > 0);
      }

      hudSync.current += dt;
      if (hudSync.current > 0.08) {
        hudSync.current = 0;
        if (scoreDirty.current) {
          scoreDirty.current = false;
          setScore(scoreRef.current);
        }
        if (livesDirty.current) {
          livesDirty.current = false;
          setLives(livesRef.current);
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(tick);
    },
    [buildBricks, draw, endGame]
  );

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(() => resize());
    if (wrapRef.current) ro.observe(wrapRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [resize, tick]);

  const start = () => {
    scoreRef.current = 0;
    livesRef.current = 3;
    levelRef.current = 1;
    comboRef.current = 0;
    paddleW.current = PADDLE_W0;
    paddleX.current = W / 2 - paddleW.current / 2;
    paddleTarget.current = paddleX.current;
    ball.current = { x: W / 2, y: H - 60, vx: 0, vy: 0, stuck: true };
    particles.current = [];
    trail.current = [];
    buildBricks(1);
    setScore(0);
    setLives(3);
    setLevel(1);
    setBallStuck(true);
    setOver(false);
    setPaused(false);
    setNewRecord(false);
    setToast(null);
    startedAtRef.current = Date.now();
    elapsedRef.current = 0;
    setElapsed(0);
    playSessionRef.current = null;
    setRunning(true);
    resize();
    void beginGameSession('breakout').then((creds) => {
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
    const down = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Escape') {
        if (e.key === ' ' && ball.current.stuck && runningRef.current) {
          e.preventDefault();
          launch();
          return;
        }
        if (runningRef.current) {
          e.preventDefault();
          setPaused((p) => !p);
          sfx.tap();
        }
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        keys.current.left = true;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        keys.current.right = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.current.right = false;
    };
    window.addEventListener('keydown', down, { passive: false });
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const pointerToX = (clientX: number) => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * W;
    paddleTarget.current = Math.max(0, Math.min(W - paddleW.current, x - paddleW.current / 2));
  };

  return (
    <GameShell
      title="Арканоид"
      viewId="breakout"
      accent="#ef4444"
      score={score}
      best={best}
      over={over}
      running={running}
      paused={paused}
      onStart={start}
      onPause={togglePause}
      level={level}
      newRecord={newRecord}
      status={toast || undefined}
      hint="Тап по полю — старт · ведите платформу"
      pcHint="← → / A D — платформа · пробел — пуск / пауза"
      showLevelSlot
      elapsedLabel={running || over ? formatDuration(elapsed) : '—'}
      footer={
        <GameHallOfFame
          key={hofKey}
          game="breakout"
          compact
          topN={3}
          currentUserId={(session?.user as { id?: string } | undefined)?.id}
        />
      }
      controls={
        <div className="game-pad is-breakout" aria-label="Управление" aria-hidden={!running && !over}>
          <GamePadButton
            className="left"
            label="←"
            ariaLabel="Влево"
            onPress={() => {
              paddleTarget.current = Math.max(0, paddleTarget.current - 36);
            }}
          />
          <GamePadButton
            className="rot is-accent"
            label={ballStuck ? 'Пуск' : '·'}
            ariaLabel="Запуск"
            onPress={launch}
          />
          <GamePadButton
            className="right"
            label="→"
            ariaLabel="Вправо"
            onPress={() => {
              paddleTarget.current = Math.min(W - paddleW.current, paddleTarget.current + 36);
            }}
          />
        </div>
      }
    >
      <div className="game-canvas-wrap is-breakout" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => {
            if (!running && !over) {
              sfx.unlock();
              sfx.start();
              start();
              return;
            }
            pointerToX(e.clientX);
            if (ball.current.stuck && running) launch();
            (e.currentTarget as HTMLCanvasElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (e.buttons || e.pointerType === 'touch') pointerToX(e.clientX);
          }}
        />
        {!running && !over ? (
          <div className="game-canvas-hint">
            <strong>Нажмите на поле</strong>
            <span>Отскок от края платформы меняет угол · комбо за серию блоков</span>
          </div>
        ) : null}
      </div>
    </GameShell>
  );
}
