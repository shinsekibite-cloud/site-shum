/** Tiny Web Audio SFX for offline games (no asset files). */

import { hasPreferencesConsent } from '@/lib/cookie-consent';

const MUTE_KEY = 'yp-games-muted';

let ctx: AudioContext | null = null;
let sessionMuted: boolean | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function isGamesMuted(): boolean {
  if (sessionMuted != null) return sessionMuted;
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setGamesMuted(muted: boolean) {
  sessionMuted = muted;
  try {
    if (hasPreferencesConsent()) {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    }
  } catch {
    /* ignore */
  }
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = 'square',
  gain = 0.045,
  slideTo?: number
) {
  if (isGamesMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  const t0 = audio.currentTime;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  unlock() {
    getCtx();
  },
  tap() {
    tone(520, 0.04, 'triangle', 0.03);
  },
  move() {
    tone(180, 0.035, 'square', 0.025);
  },
  rotate() {
    tone(340, 0.06, 'triangle', 0.035);
  },
  drop() {
    tone(140, 0.05, 'square', 0.03);
  },
  lock() {
    tone(110, 0.08, 'square', 0.04, 70);
  },
  clear(lines = 1) {
    const base = 420 + lines * 40;
    tone(base, 0.08, 'square', 0.04);
    setTimeout(() => tone(base * 1.25, 0.1, 'square', 0.035), 50);
    if (lines >= 3) setTimeout(() => tone(base * 1.5, 0.12, 'triangle', 0.04), 100);
  },
  eat() {
    tone(660, 0.07, 'square', 0.04);
    setTimeout(() => tone(880, 0.06, 'triangle', 0.03), 40);
  },
  bonus() {
    tone(523, 0.07, 'triangle', 0.04);
    setTimeout(() => tone(784, 0.09, 'triangle', 0.045), 55);
    setTimeout(() => tone(1046, 0.12, 'square', 0.035), 110);
  },
  chill() {
    tone(420, 0.1, 'sine', 0.04, 220);
  },
  combo(n = 2) {
    tone(480 + n * 40, 0.08, 'triangle', 0.04);
    setTimeout(() => tone(600 + n * 50, 0.1, 'triangle', 0.04), 60);
  },
  die() {
    tone(220, 0.18, 'sawtooth', 0.05, 70);
  },
  win() {
    tone(523, 0.1, 'triangle', 0.04);
    setTimeout(() => tone(659, 0.1, 'triangle', 0.04), 90);
    setTimeout(() => tone(784, 0.16, 'triangle', 0.045), 180);
  },
  start() {
    tone(392, 0.07, 'triangle', 0.035);
    setTimeout(() => tone(523, 0.09, 'triangle', 0.035), 70);
  },
  capture() {
    tone(300, 0.07, 'square', 0.04);
    setTimeout(() => tone(200, 0.08, 'square', 0.035), 50);
  },
};
