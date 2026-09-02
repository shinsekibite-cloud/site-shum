'use client';

/** HiDPI canvas sizing + contain-fit into a box (logical coords → CSS px). */

export function setupHiDpiCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  /** Extra uniform scale in CSS pixels (logical unit → CSS px). Default 1. */
  contentScale = 1
): CanvasRenderingContext2D | null {
  const dpr = Math.min(2.5, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const w = Math.max(1, Math.round(cssWidth));
  const h = Math.max(1, Math.round(cssHeight));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const s = dpr * contentScale;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  return ctx;
}

export function fitCanvasInBox(
  canvas: HTMLCanvasElement,
  logicalW: number,
  logicalH: number,
  boxW: number,
  boxH: number,
  pad = 0
): { cssW: number; cssH: number; scale: number; ctx: CanvasRenderingContext2D | null } {
  const maxW = Math.max(40, boxW - pad * 2);
  const maxH = Math.max(40, boxH - pad * 2);
  const scale = Math.min(maxW / logicalW, maxH / logicalH);
  const cssW = Math.max(1, Math.floor(logicalW * scale));
  const cssH = Math.max(1, Math.floor(logicalH * scale));
  // Map 1 logical unit → `scale` CSS px so draw(0..logicalW) fills the canvas.
  const ctx = setupHiDpiCanvas(canvas, cssW, cssH, scale);
  return { cssW, cssH, scale, ctx };
}

/** Fixed-timestep helper for rAF loops (Snake / Tetris). */
export function createFixedStepper(stepMs: number) {
  let acc = 0;
  let last = 0;
  return {
    reset(now = performance.now()) {
      acc = 0;
      last = now;
    },
    setStepMs(ms: number) {
      stepMs = Math.max(16, ms);
    },
    get stepMs() {
      return stepMs;
    },
    /** Call from rAF; invokes `step` 0..N times. Returns dt seconds for visuals. */
    advance(now: number, step: () => void, maxSteps = 5): number {
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt * 1000;
      let n = 0;
      while (acc >= stepMs && n < maxSteps) {
        acc -= stepMs;
        step();
        n += 1;
      }
      // Avoid spiral of death when tab was backgrounded
      if (acc > stepMs * maxSteps) acc = 0;
      return dt;
    },
  };
}
