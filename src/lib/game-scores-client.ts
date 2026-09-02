/** Client helpers: persist scores offline and sync when online. */

const QUEUE_KEY = 'yp-game-score-queue';
const LOCAL_BEST_KEY = 'yp-game-best';
const LOCAL_PLAYS_KEY = 'yp-game-plays';

export type GameSessionCreds = {
  sessionId: string;
  token: string;
  startedAt?: number;
  expiresAt?: number;
};

export type QueuedScore = {
  game: string;
  score: number;
  event?: string;
  meta?: Record<string, unknown>;
  sessionId?: string;
  token?: string;
  at: number;
};

export function getLocalBest(game: string): number {
  try {
    const raw = localStorage.getItem(LOCAL_BEST_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return Number(map[game] || 0) || 0;
  } catch {
    return 0;
  }
}

export function setLocalBest(game: string, score: number) {
  try {
    const raw = localStorage.getItem(LOCAL_BEST_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[game] = Math.max(Number(map[game] || 0), score);
    localStorage.setItem(LOCAL_BEST_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getLocalPlayCount(game: string): number {
  try {
    const raw = localStorage.getItem(LOCAL_PLAYS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return Math.max(0, Math.floor(Number(map[game] || 0)) || 0);
  } catch {
    return 0;
  }
}

export function bumpLocalPlayCount(game: string) {
  try {
    const raw = localStorage.getItem(LOCAL_PLAYS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[game] = Math.max(0, Math.floor(Number(map[game] || 0)) || 0) + 1;
    localStorage.setItem(LOCAL_PLAYS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getAllLocalPlayCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LOCAL_PLAYS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) {
      const n = Math.max(0, Math.floor(Number(v) || 0));
      if (n > 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function enqueueScore(payload: Omit<QueuedScore, 'at'>) {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const list: QueuedScore[] = raw ? JSON.parse(raw) : [];
    list.push({ ...payload, at: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-40)));
  } catch {
    /* ignore */
  }
}

/** Wait briefly for an in-flight beginGameSession() to finish. */
function emitEcoAwarded(data: unknown) {
  try {
    const amount = Number((data as { ecoAwarded?: number })?.ecoAwarded) || 0;
    if (amount > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('yp:eco-awarded', { detail: { amount, reason: 'game_daily' } })
      );
    }
  } catch {
    /* ignore */
  }
}

export async function waitForPlaySession(
  get: () => GameSessionCreds | null,
  timeoutMs = 1600
): Promise<GameSessionCreds | null> {
  const hit = get();
  if (hit) return hit;
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, 40));
    const next = get();
    if (next) return next;
  }
  return get();
}

/** Start a server-validated play session before the match begins. */
export async function beginGameSession(game: string): Promise<GameSessionCreds | null> {
  try {
    const res = await fetch('/api/user/games/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game }),
    });
    if (res.status === 401) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.sessionId || !data?.token) return null;
    return {
      sessionId: String(data.sessionId),
      token: String(data.token),
      startedAt: typeof data.startedAt === 'number' ? data.startedAt : undefined,
      expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : undefined,
    };
  } catch {
    return null;
  }
}

export async function reportGameScore(opts: {
  game: string;
  score: number;
  event?: string;
  meta?: Record<string, unknown>;
  sessionId?: string;
  token?: string;
}) {
  if (opts.event === 'play' || opts.score > 0 || opts.event === 'win') {
    bumpLocalPlayCount(opts.game);
  }
  setLocalBest(opts.game, opts.score);
  const payload = {
    game: opts.game,
    score: opts.score,
    event: opts.event,
    meta: opts.meta,
    sessionId: opts.sessionId,
    token: opts.token,
  };
  try {
    const res = await fetch('/api/user/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('fail');
    try {
      emitEcoAwarded(await res.json());
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    enqueueScore(payload);
    return false;
  }
}

export async function reportSecretMenuFound() {
  try {
    await fetch('/api/user/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'secret_menu' }),
    });
  } catch {
    enqueueScore({ game: 'secret', score: 0, event: 'secret_menu' });
  }
}

export async function flushGameScoreQueue() {
  if (typeof window === 'undefined' || !navigator.onLine) return;
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const list: QueuedScore[] = raw ? JSON.parse(raw) : [];
    if (!list.length) return;
    const left: QueuedScore[] = [];
    for (const item of list) {
      const needsSession =
        item.event === 'score' ||
        item.event === 'win' ||
        ((!item.event || item.event === 'score') && item.score > 0);
      if (needsSession && (!item.sessionId || !item.token)) {
        // Orphaned pre-session queue items — drop, cannot validate
        continue;
      }
      try {
        const res = await fetch('/api/user/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        if (!res.ok) {
          // Expired / consumed sessions will never succeed — drop 4xx without retry storm
          if (res.status >= 400 && res.status < 500 && res.status !== 429) continue;
          left.push(item);
        } else {
          try {
            emitEcoAwarded(await res.json());
          } catch {
            /* ignore */
          }
        }
      } catch {
        left.push(item);
      }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(left));
  } catch {
    /* ignore */
  }
}
