'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { beginGameSession, getLocalBest, reportGameScore, waitForPlaySession, type GameSessionCreds } from '@/lib/game-scores-client';
import GameShell, { GamePadButton } from '@/components/games/GameShell';
import GameHallOfFame from '@/components/games/GameHallOfFame';
import { createFixedStepper, setupHiDpiCanvas } from '@/lib/game-canvas';
import { formatDuration } from '@/lib/game-meta';
import { sfx } from '@/lib/game-sfx';

const COLS = 10;
const ROWS = 20;
const CELL = 24;

const SHAPES: number[][][] = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
];

const COLORS = ['#38bdf8', '#fbbf24', '#a78bfa', '#fb7185', '#34d399', '#60a5fa', '#f472b6'];

function rotate(m: number[][]) {
  const h = m.length;
  const w = m[0].length;
  const out: number[][] = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x][h - 1 - y] = m[y][x];
  return out;
}

function collides(board: number[][], piece: { shape: number[][]; x: number; y: number }) {
  for (let dy = 0; dy < piece.shape.length; dy++) {
    for (let dx = 0; dx < piece.shape[dy].length; dx++) {
      if (!piece.shape[dy][dx]) continue;
      const x = piece.x + dx;
      const y = piece.y + dy;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x]) return true;
    }
  }
  return false;
}

function randomPiece() {
  const i = Math.floor(Math.random() * SHAPES.length);
  const shape = SHAPES[i].map((r) => [...r]);
  return { shape, x: Math.floor((COLS - shape[0].length) / 2), y: 0, color: i + 1 };
}

export default function TetrisGame() {
  const { data: session } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [level, setLevel] = useState(1);
  const [combo, setCombo] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hofKey, setHofKey] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const playSessionRef = useRef<GameSessionCreds | null>(null);

  const boardRef = useRef<number[][]>(Array.from({ length: ROWS }, () => Array(COLS).fill(0)));
  const pieceRef = useRef<{ shape: number[][]; x: number; y: number; color: number } | null>(null);
  const nextPieceRef = useRef(randomPiece());
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const linesRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const flashRowsRef = useRef<number[]>([]);
  const toastTimer = useRef<number | null>(null);
  const stepperRef = useRef(createFixedStepper(520));
  const levelRef = useRef(1);

  useEffect(() => setBest(getLocalBest('tetris')), []);
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

  const flash = (text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1000);
  };

  const drawNext = useCallback(() => {
    const c = nextRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(15,23,42,0.65)';
    ctx.fillRect(0, 0, c.width, c.height);
    const p = nextPieceRef.current;
    const cell = 14;
    const w = p.shape[0].length * cell;
    const h = p.shape.length * cell;
    const ox = (c.width - w) / 2;
    const oy = (c.height - h) / 2;
    const fill = COLORS[(p.color - 1) % COLORS.length];
    p.shape.forEach((row, dy) =>
      row.forEach((v, dx) => {
        if (!v) return;
        ctx.fillStyle = fill;
        ctx.fillRect(ox + dx * cell + 1, oy + dy * cell + 1, cell - 2, cell - 2);
      })
    );
  }, []);

  const spawn = useCallback(() => {
    const piece = nextPieceRef.current;
    piece.x = Math.floor((COLS - piece.shape[0].length) / 2);
    piece.y = 0;
    pieceRef.current = piece;
    nextPieceRef.current = randomPiece();
    drawNext();
    return !collides(boardRef.current, piece);
  }, [drawNext]);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const logicalW = COLS * CELL;
    const logicalH = ROWS * CELL;
    const bg = ctx.createLinearGradient(0, 0, 0, logicalH);
    bg.addColorStop(0, '#0b1220');
    bg.addColorStop(1, '#020617');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, logicalW, logicalH);

    ctx.strokeStyle = 'rgba(148,163,184,0.07)';
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, ROWS * CELL);
      ctx.stroke();
    }

    const paint = (x: number, y: number, color: number, alpha = 1) => {
      if (color <= 0 || y < 0) return;
      const fill = COLORS[(color - 1) % COLORS.length];
      const px = x * CELL;
      const py = y * CELL;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(px + 2, py + 2, CELL - 4, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(px + 2, py + CELL - 6, CELL - 4, 4);
      ctx.globalAlpha = 1;
    };

    boardRef.current.forEach((row, y) =>
      row.forEach((v, x) => {
        paint(x, y, v);
        if (flashRowsRef.current.includes(y)) {
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      })
    );
    const p = pieceRef.current;
    if (p) {
      let gy = p.y;
      while (!collides(boardRef.current, { ...p, y: gy + 1 })) gy += 1;
      if (gy !== p.y) {
        p.shape.forEach((row, dy) =>
          row.forEach((v, dx) => {
            if (v) paint(p.x + dx, gy + dy, p.color, 0.22);
          })
        );
      }
      p.shape.forEach((row, dy) =>
        row.forEach((v, dx) => {
          if (v) paint(p.x + dx, p.y + dy, p.color);
        })
      );
    }

    if (pausedRef.current && runningRef.current) {
      ctx.fillStyle = 'rgba(2,6,23,0.45)';
      ctx.fillRect(0, 0, logicalW, logicalH);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 16px Outfit, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Пауза', logicalW / 2, logicalH / 2);
    }
  }, []);

  const lock = useCallback(() => {
    const p = pieceRef.current;
    if (!p) return;
    p.shape.forEach((row, dy) =>
      row.forEach((v, dx) => {
        if (!v) return;
        const y = p.y + dy;
        const x = p.x + dx;
        if (y >= 0 && y < ROWS && x >= 0 && x < COLS) boardRef.current[y][x] = p.color;
      })
    );
    sfx.lock();
    const fullRows: number[] = [];
    boardRef.current.forEach((row, y) => {
      if (row.every((c) => c > 0)) fullRows.push(y);
    });
    const cleared = fullRows.length;
    if (cleared) {
      flashRowsRef.current = fullRows;
      draw();
      window.setTimeout(() => {
        flashRowsRef.current = [];
      }, 90);
      boardRef.current = boardRef.current.filter((row) => !row.every((c) => c > 0));
      while (boardRef.current.length < ROWS) boardRef.current.unshift(Array(COLS).fill(0));
      comboRef.current += 1;
      setCombo(comboRef.current);
      linesRef.current += cleared;
      const levelNow = 1 + Math.floor(linesRef.current / 8);
      levelRef.current = levelNow;
      setLevel(levelNow);
      const base = [0, 100, 300, 500, 800][cleared] || cleared * 200;
      const comboBonus = (comboRef.current - 1) * 50;
      const add = (base + comboBonus) * (1 + Math.floor((levelNow - 1) * 0.1));
      scoreRef.current += add;
      setScore(scoreRef.current);
      sfx.clear(cleared);
      if (cleared >= 4) {
        flash('Тетрис!');
        sfx.bonus();
      } else if (comboRef.current > 1) {
        flash(`Комбо ×${comboRef.current}`);
        sfx.combo(comboRef.current);
      }
    } else {
      comboRef.current = 0;
      setCombo(0);
    }
  }, [draw]);

  const endGame = useCallback(async () => {
    runningRef.current = false;
    setOver(true);
    setRunning(false);
    setPaused(false);
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    sfx.die();
    const s = scoreRef.current;
    const prev = getLocalBest('tetris');
    const isNew = s > prev && s > 0;
    setNewRecord(isNew);
    setBest((b) => Math.max(b, s));
    if (isNew) sfx.win();
    const creds = await waitForPlaySession(() => playSessionRef.current);
    playSessionRef.current = null;
    await reportGameScore({
      game: 'tetris',
      score: s,
      sessionId: creds?.sessionId,
      token: creds?.token,
    });
    setHofKey((k) => k + 1);
  }, []);

  const softDrop = useCallback(() => {
    if (!runningRef.current || pausedRef.current) return;
    const p = pieceRef.current;
    if (!p) return;
    const next = { ...p, y: p.y + 1 };
    if (!collides(boardRef.current, next)) {
      pieceRef.current = next;
      draw();
      return;
    }
    lock();
    if (!spawn()) void endGame();
    else draw();
  }, [draw, endGame, lock, spawn]);

  const move = (dx: number) => {
    if (!runningRef.current || pausedRef.current) return;
    const p = pieceRef.current;
    if (!p) return;
    const next = { ...p, x: p.x + dx };
    if (!collides(boardRef.current, next)) {
      pieceRef.current = next;
      sfx.move();
      draw();
    }
  };

  const rot = () => {
    if (!runningRef.current || pausedRef.current) return;
    const p = pieceRef.current;
    if (!p) return;
    const next = { ...p, shape: rotate(p.shape) };
    if (!collides(boardRef.current, next)) {
      pieceRef.current = next;
      sfx.rotate();
      draw();
    }
  };

  const hardDrop = () => {
    if (!runningRef.current || pausedRef.current) return;
    const p = pieceRef.current;
    if (!p) return;
    let y = p.y;
    while (!collides(boardRef.current, { ...p, y: y + 1 })) y += 1;
    const dropped = y - p.y;
    pieceRef.current = { ...p, y };
    if (dropped > 0) {
      scoreRef.current += dropped * 2;
      setScore(scoreRef.current);
      sfx.drop();
    }
    lock();
    if (!spawn()) void endGame();
    else draw();
  };

  const start = () => {
    boardRef.current = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    scoreRef.current = 0;
    comboRef.current = 0;
    linesRef.current = 0;
    levelRef.current = 1;
    nextPieceRef.current = randomPiece();
    stepperRef.current.setStepMs(520);
    stepperRef.current.reset();
    setScore(0);
    setCombo(0);
    setLevel(1);
    setOver(false);
    setPaused(false);
    setNewRecord(false);
    startedAtRef.current = Date.now();
    elapsedRef.current = 0;
    setElapsed(0);
    spawn();
    draw();
    drawNext();
    playSessionRef.current = null;
    setRunning(true);
    void beginGameSession('tetris').then((creds) => {
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
    draw();
  };

  const dropSpeedMs = useCallback(() => {
    const lv = levelRef.current;
    return Math.max(90, 520 - (lv - 1) * 38 - Math.floor(scoreRef.current / 500) * 18);
  }, []);

  useEffect(() => {
    draw();
    drawNext();
    const fit = () => {
      const c = canvasRef.current;
      if (!c) return;
      const parent = c.parentElement;
      const logicalW = COLS * CELL;
      const logicalH = ROWS * CELL;
      if (!parent) {
        setupHiDpiCanvas(c, logicalW, logicalH, 1);
        return;
      }
      const scale = Math.min(parent.clientWidth / logicalW, (parent.clientHeight || logicalH) / logicalH, 2.2);
      setupHiDpiCanvas(c, logicalW * scale, logicalH * scale, scale);
    };
    fit();
    const ro = canvasRef.current?.parentElement ? new ResizeObserver(fit) : null;
    if (canvasRef.current?.parentElement) ro?.observe(canvasRef.current.parentElement);

    const loop = (now: number) => {
      if (runningRef.current && !pausedRef.current) {
        stepperRef.current.setStepMs(dropSpeedMs());
        stepperRef.current.advance(now, softDrop);
      } else {
        stepperRef.current.reset(now);
      }
      draw();
      rafRef.current = window.requestAnimationFrame(loop);
    };
    rafRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      if (tickRef.current) window.clearInterval(tickRef.current);
      ro?.disconnect();
    };
  }, [draw, drawNext, dropSpeedMs, softDrop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (running) {
          e.preventDefault();
          togglePause();
        }
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(e.key)) e.preventDefault();
      if (e.key === 'ArrowLeft') move(-1);
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'ArrowDown') softDrop();
      if (e.key === 'ArrowUp' || e.key === 'x' || e.key === 'X') rot();
      if (e.key === ' ') hardDrop();
    };
    window.addEventListener('keydown', onKey, { passive: false });
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <GameShell
      title="Тетрис"
      viewId="tetris"
      accent="#3b82f6"
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
      hint="Тап — старт · в игре: тап — поворот, свайп — ход"
      pcHint="← → ↓ · ↑/X — поворот · пробел — сброс · P/Esc — пауза"
      showLevelSlot
      showComboSlot
      elapsedLabel={running || over ? formatDuration(elapsed) : '—'}
      extra={
        <div className="tetris-next">
          <span>Следующая</span>
          <canvas ref={nextRef} width={64} height={48} aria-hidden />
        </div>
      }
      footer={
        <GameHallOfFame
          key={hofKey}
          game="tetris"
          compact
          topN={3}
          currentUserId={(session?.user as { id?: string } | undefined)?.id}
        />
      }
      controls={
        <div className="game-pad is-tetris" aria-label="Управление" aria-hidden={!running && !over}>
          <GamePadButton className="left" label="←" ariaLabel="Влево" onPress={() => move(-1)} />
          <GamePadButton className="rot is-accent" label="↻" ariaLabel="Поворот" onPress={rot} />
          <GamePadButton className="right" label="→" ariaLabel="Вправо" onPress={() => move(1)} />
          <GamePadButton className="down" label="↓" ariaLabel="Мягко вниз" onPress={softDrop} />
          <GamePadButton className="drop is-accent" label="Сброс ↓↓" ariaLabel="Сбросить вниз" onPress={hardDrop} />
        </div>
      }
    >
      <div className="game-canvas-wrap is-tetris">
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
            const el = e.currentTarget as HTMLCanvasElement & {
              _tx?: number;
              _ty?: number;
              _t0?: number;
            };
            el._tx = t.clientX;
            el._ty = t.clientY;
            el._t0 = Date.now();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            const t = e.changedTouches[0];
            const el = e.currentTarget as HTMLCanvasElement & {
              _tx?: number;
              _ty?: number;
              _t0?: number;
            };
            const dx = t.clientX - (el._tx || 0);
            const dy = t.clientY - (el._ty || 0);
            const dt = Date.now() - (el._t0 || 0);
            if (!running && !over) {
              if (Math.abs(dx) < 16 && Math.abs(dy) < 16) {
                sfx.unlock();
                sfx.start();
                start();
              }
              return;
            }
            if (Math.abs(dx) < 16 && Math.abs(dy) < 16 && dt < 280) {
              rot();
              return;
            }
            if (Math.abs(dx) > Math.abs(dy)) {
              if (Math.abs(dx) >= 18) move(dx > 0 ? 1 : -1);
            } else if (dy > 28) {
              if (dy > 90 || dt < 220) hardDrop();
              else softDrop();
            }
          }}
        />
        {!running && !over ? (
          <div className="game-canvas-hint">
            <strong>Нажмите на поле</strong>
            <span>Свайп ←→ · вниз — сброс · тап — поворот</span>
          </div>
        ) : null}
      </div>
    </GameShell>
  );
}
