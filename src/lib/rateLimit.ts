import Redis from 'ioredis';

type Bucket = { count: number; expires: number };

/**
 * Fixed-window rate limiter.
 * When REDIS_URL is set, counters are shared across web instances via Redis INCR.
 * Otherwise falls back to an in-process Map (single instance).
 */
export class RateLimiter {
  private cache = new Map<string, Bucket>();
  private windowMs: number;
  private maxRequests: number;
  private prefix: string;

  constructor(windowMs: number, maxRequests: number, prefix = 'rl') {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.prefix = prefix;
  }

  /** Prefer checkAsync in route handlers. Sync path is memory-only. */
  public check(key: string, maxOverride?: number): boolean {
    return this.checkMemory(key, maxOverride);
  }

  public async checkAsync(key: string, maxOverride?: number): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return this.checkMemory(key, maxOverride);
    try {
      return await this.checkRedis(redis, key, maxOverride);
    } catch (e) {
      console.warn('[rateLimit] redis fallback', (e as Error)?.message || e);
      return this.checkMemory(key, maxOverride);
    }
  }

  public remaining(key: string, maxOverride?: number): number {
    const max = maxOverride ?? this.maxRequests;
    const now = Date.now();
    const record = this.cache.get(key);
    if (!record || now > record.expires) return max;
    return Math.max(0, max - record.count);
  }

  private checkMemory(key: string, maxOverride?: number): boolean {
    const max = maxOverride ?? this.maxRequests;
    const now = Date.now();
    const record = this.cache.get(key);
    if (!record || now > record.expires) {
      this.cache.set(key, { count: 1, expires: now + this.windowMs });
      return true;
    }
    if (record.count >= max) return false;
    record.count++;
    this.cache.set(key, record);
    return true;
  }

  private async checkRedis(redis: Redis, key: string, maxOverride?: number): Promise<boolean> {
    const max = maxOverride ?? this.maxRequests;
    const redisKey = `${this.prefix}:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, this.windowMs);
    }
    return count <= max;
  }
}

let redisClient: Redis | null | undefined;

/** Shared Redis client for rate limits / short-lived sessions (null if REDIS_URL unset). */
export function getSharedRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    redisClient = null;
    return null;
  }
  try {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      connectTimeout: 1500,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });
    redisClient.on('error', (err) => {
      const msg = err?.message || String(err);
      console.warn('[redis]', msg);
      /* Wrong/missing AUTH → stop hammering Redis on every rate-limit check */
      if (/NOAUTH|WRONGPASS|invalid password|Authentication required/i.test(msg)) {
        try {
          redisClient?.disconnect();
        } catch {
          /* ignore */
        }
        redisClient = null;
      }
    });
    return redisClient;
  } catch (e) {
    console.warn('[redis] init failed', e);
    redisClient = null;
    return null;
  }
}

function getRedis(): Redis | null {
  return getSharedRedis();
}

export const registerRateLimiter = new RateLimiter(60 * 1000, 5, 'reg');
export const resetPasswordRateLimiter = new RateLimiter(5 * 60 * 1000, 3, 'reset');
export const recoveryPhraseRateLimiter = new RateLimiter(15 * 60 * 1000, 5, 'phrase');
export const loginRateLimiter = new RateLimiter(5 * 60 * 1000, 5, 'login');
/** Shared IP bucket for credential login storms (paired with per-login key). */
export const loginIpRateLimiter = new RateLimiter(5 * 60 * 1000, 20, 'login-ip');
/** Public places catalog / search — light anti-scrape */
export const placesReadRateLimiter = new RateLimiter(60 * 1000, 60, 'places-r');
export const messagePerMinuteLimiter = new RateLimiter(60 * 1000, 20, 'msg-m');
export const messagePerHourLimiter = new RateLimiter(60 * 60 * 1000, 120, 'msg-h');
export const friendRequestHourLimiter = new RateLimiter(60 * 60 * 1000, 15, 'fr');
export const applicationHourLimiter = new RateLimiter(60 * 60 * 1000, 10, 'app');
export const bookingHourLimiter = new RateLimiter(60 * 60 * 1000, 8, 'book');
export const verifyEmailRateLimiter = new RateLimiter(15 * 60 * 1000, 10, 'verify');
/** Per-address OTP guesses — complements the IP bucket. */
export const verifyEmailPerAddressLimiter = new RateLimiter(15 * 60 * 1000, 8, 'verify-email');
export const uploadRateLimiter = new RateLimiter(60 * 1000, 20, 'upload');
export const mapsRateLimiter = new RateLimiter(60 * 1000, 30, 'maps');
export const gamesPostRateLimiter = new RateLimiter(60 * 1000, 40, 'games');
export const opsFlagsRateLimiter = new RateLimiter(60 * 1000, 20, 'ops-flags');
export const presenceRateLimiter = new RateLimiter(60 * 1000, 12, 'presence');
/** Favorites / ratings / reviews / invites for places — 20 writes per hour */
export const placesRateLimiter = new RateLimiter(60 * 60 * 1000, 20, 'places');
/** Eco shop equip/buy/unequip — must allow rapid try-on (not shared with places). */
export const ecoWriteRateLimiter = new RateLimiter(60 * 1000, 120, 'eco-w');
/** Protects against client fetch storms (shop remount loops). */
export const ecoReadRateLimiter = new RateLimiter(60 * 1000, 30, 'eco-r');
export const collectiblesReadRateLimiter = new RateLimiter(60 * 1000, 20, 'col-r');
/** MAX bot webhook — per sender (commands + callbacks). */
export const maxWebhookUserRateLimiter = new RateLimiter(60 * 1000, 40, 'max-wh-u');
/** MAX bot webhook — global flood cap. */
export const maxWebhookGlobalRateLimiter = new RateLimiter(60 * 1000, 240, 'max-wh-g');

export function rateLimitJson(message: string) {
  return {
    message,
    retryAfterSec: 60,
  };
}

const LOGIN_FAIL_MEM = new Map<string, { n: number; exp: number }>();
const LOGIN_FAIL_TTL_MS = 15 * 60 * 1000;
const LOGIN_FAIL_LOCK = 8;

export async function noteLoginFailure(key: string): Promise<{ locked: boolean; fails: number }> {
  const redis = getSharedRedis();
  const rk = `login-fail:${key}`;
  if (redis) {
    try {
      const n = await redis.incr(rk);
      if (n === 1) await redis.pexpire(rk, LOGIN_FAIL_TTL_MS);
      return { locked: n >= LOGIN_FAIL_LOCK, fails: n };
    } catch {
      /* fall through */
    }
  }
  const now = Date.now();
  const row = LOGIN_FAIL_MEM.get(key);
  if (!row || now > row.exp) {
    LOGIN_FAIL_MEM.set(key, { n: 1, exp: now + LOGIN_FAIL_TTL_MS });
    return { locked: false, fails: 1 };
  }
  row.n += 1;
  return { locked: row.n >= LOGIN_FAIL_LOCK, fails: row.n };
}

export async function clearLoginFailures(key: string) {
  const redis = getSharedRedis();
  if (redis) {
    try {
      await redis.del(`login-fail:${key}`);
    } catch {
      /* ignore */
    }
  }
  LOGIN_FAIL_MEM.delete(key);
}

export async function isLoginLocked(key: string): Promise<boolean> {
  const redis = getSharedRedis();
  if (redis) {
    try {
      const n = Number((await redis.get(`login-fail:${key}`)) || 0);
      return n >= LOGIN_FAIL_LOCK;
    } catch {
      /* ignore */
    }
  }
  const row = LOGIN_FAIL_MEM.get(key);
  if (!row || Date.now() > row.exp) return false;
  return row.n >= LOGIN_FAIL_LOCK;
}
