import crypto from 'crypto';
import { getSharedRedis } from '@/lib/rateLimit';
import type { GameId } from '@/lib/games';

const SESSION_TTL_MS = 45 * 60 * 1000;
const MEMORY_MAX = 4000;

export type GamePlaySession = {
  id: string;
  userId: string;
  game: GameId;
  startedAt: number;
  nonce: string;
};

type StoredSession = GamePlaySession & { consumedAt?: number };

const memory = new Map<string, { data: StoredSession; expires: number }>();

function signingSecret() {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.DOCUMENT_SIGNING_SECRET ||
    process.env.TICKET_SECRET ||
    ''
  );
}

function redisKey(id: string) {
  return `gplay:${id}`;
}

function signSession(s: GamePlaySession) {
  const secret = signingSecret();
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for game sessions');
  return crypto
    .createHmac('sha256', secret)
    .update(`${s.id}:${s.userId}:${s.game}:${s.startedAt}:${s.nonce}`)
    .digest('hex')
    .slice(0, 24);
}

function tokensEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function pruneMemory() {
  if (memory.size < MEMORY_MAX) return;
  const now = Date.now();
  for (const [k, v] of memory) {
    if (v.expires < now || v.data.consumedAt) memory.delete(k);
  }
  if (memory.size < MEMORY_MAX) return;
  const drop = [...memory.keys()].slice(0, Math.ceil(memory.size / 5));
  for (const k of drop) memory.delete(k);
}

async function saveSession(s: StoredSession) {
  const expires = s.startedAt + SESSION_TTL_MS;
  pruneMemory();
  memory.set(s.id, { data: s, expires });
  const redis = getSharedRedis();
  if (!redis) return;
  try {
    const ttl = Math.max(1000, expires - Date.now());
    await redis.set(redisKey(s.id), JSON.stringify(s), 'PX', ttl);
  } catch (e) {
    console.warn('[game-session] redis save', (e as Error)?.message || e);
  }
}

/** Atomically take session (one-shot) — prevents double-submit races. */
async function takeSession(id: string): Promise<StoredSession | null> {
  const redis = getSharedRedis();
  if (redis) {
    try {
      // Redis 6.2+ GETDEL; fall back to GET+DEL if unavailable
      let raw: string | null = null;
      const r = redis as { getdel?: (k: string) => Promise<string | null> };
      if (typeof r.getdel === 'function') {
        raw = await r.getdel(redisKey(id));
      } else {
        raw = await redis.get(redisKey(id));
        if (raw) await redis.del(redisKey(id));
      }
      memory.delete(id);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredSession;
        if (parsed?.id && parsed.userId && parsed.game && !parsed.consumedAt) return parsed;
      }
      // Redis answered — do not fall through to stale memory
      return null;
    } catch (e) {
      console.warn('[game-session] redis take', (e as Error)?.message || e);
    }
  }
  const row = memory.get(id);
  if (!row) return null;
  if (row.expires < Date.now() || row.data.consumedAt) {
    memory.delete(id);
    return null;
  }
  row.data.consumedAt = Date.now();
  memory.delete(id);
  return { ...row.data };
}

/** Per-game absolute ceilings (below legacy 50k soft cap). */
export const GAME_SCORE_CAPS: Record<GameId, number> = {
  snake: 5_000,
  tetris: 15_000,
  breakout: 10_000,
  memory: 2_000,
  checkers: 1_000_000,
  fifteen: 5_000,
};

/**
 * Generous max score growth vs elapsed seconds — blocks absurd POSTs
 * without punishing skilled play.
 */
export function maxPlausibleScore(game: GameId, elapsedMs: number): number {
  const sec = Math.max(0, elapsedMs) / 1000;
  switch (game) {
    case 'snake':
      return Math.floor(sec * 18 + 40);
    case 'tetris':
      return Math.floor(sec * 120 + 200);
    case 'breakout':
      return Math.floor(sec * 140 + 80);
    case 'memory':
      return Math.min(GAME_SCORE_CAPS.memory, Math.floor(sec * 80 + 100));
    case 'fifteen':
      return Math.min(GAME_SCORE_CAPS.fifteen, Math.floor(sec * 40 + 200));
    case 'checkers':
      return GAME_SCORE_CAPS.checkers;
    default:
      return 50_000;
  }
}

export async function createGamePlaySession(userId: string, game: GameId) {
  const session: GamePlaySession = {
    id: crypto.randomBytes(12).toString('hex'),
    userId,
    game,
    startedAt: Date.now(),
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  await saveSession(session);
  return {
    sessionId: session.id,
    token: signSession(session),
    startedAt: session.startedAt,
    expiresAt: session.startedAt + SESSION_TTL_MS,
  };
}

export type SessionValidationOk = {
  ok: true;
  session: GamePlaySession;
  elapsedMs: number;
};

export type SessionValidationErr = {
  ok: false;
  status: number;
  message: string;
};

/**
 * Verify HMAC + stored session, enforce timing/score plausibility, then consume (one-shot).
 */
export async function verifyAndConsumeGameSession(opts: {
  sessionId: string;
  token: string;
  userId: string;
  game: GameId;
  score: number;
  requireMinMs?: number;
}): Promise<SessionValidationOk | SessionValidationErr> {
  const sessionId = String(opts.sessionId || '').trim();
  const token = String(opts.token || '').trim();
  if (!sessionId || !token) {
    return { ok: false, status: 400, message: 'Нужна игровая сессия. Начните партию заново.' };
  }

  // One-shot take — concurrent submits cannot reuse the same session
  const stored = await takeSession(sessionId);
  if (!stored) {
    return { ok: false, status: 400, message: 'Сессия истекла или не найдена. Начните партию заново.' };
  }
  if (stored.userId !== opts.userId || stored.game !== opts.game) {
    return { ok: false, status: 403, message: 'Сессия не принадлежит этой партии.' };
  }

  let expected: string;
  try {
    expected = signSession(stored);
  } catch {
    return { ok: false, status: 500, message: 'Сервер не может проверить сессию.' };
  }
  if (!tokensEqual(token, expected)) {
    return { ok: false, status: 403, message: 'Неверная подпись сессии.' };
  }

  const now = Date.now();
  if (now - stored.startedAt > SESSION_TTL_MS) {
    return { ok: false, status: 400, message: 'Сессия истекла. Начните партию заново.' };
  }

  const elapsedMs = Math.max(0, now - stored.startedAt);
  const minMs = opts.requireMinMs ?? (opts.score > 0 ? 1500 : 0);
  if (elapsedMs < minMs) {
    return { ok: false, status: 400, message: 'Слишком быстрый результат — подозрительно.' };
  }

  const cap = GAME_SCORE_CAPS[opts.game] ?? 50_000;
  if (opts.score > cap) {
    return { ok: false, status: 400, message: 'Слишком большой счёт для этой игры.' };
  }

  if (opts.game !== 'checkers') {
    const plausible = maxPlausibleScore(opts.game, elapsedMs);
    if (opts.score > plausible) {
      return {
        ok: false,
        status: 400,
        message: 'Счёт не соответствует длительности партии.',
      };
    }
  } else if (opts.score > 0 || minMs > 0) {
    const need = opts.requireMinMs ?? 8_000;
    if (elapsedMs < need) {
      return { ok: false, status: 400, message: 'Партия в шашки слишком короткая.' };
    }
  }

  return {
    ok: true,
    session: {
      id: stored.id,
      userId: stored.userId,
      game: stored.game,
      startedAt: stored.startedAt,
      nonce: stored.nonce,
    },
    elapsedMs,
  };
}
