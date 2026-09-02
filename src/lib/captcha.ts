/**
 * Self-hosted anti-bot: arithmetic challenge + honeypot + single-use Redis/memory token.
 */
import crypto from 'crypto';
import { getSharedRedis } from '@/lib/rateLimit';

const TTL_SEC = 300;
const MEM = new Map<string, { answer: string; exp: number }>();

function requireHmacSecret(fallbackDevOnly: string): string {
  const s =
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    '';
  if (s) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET is required');
  }
  return fallbackDevOnly;
}

function secret() {
  return requireHmacSecret('yp-captcha-dev');
}

function cleanupMem() {
  const now = Date.now();
  for (const [k, v] of MEM) {
    if (v.exp < now) MEM.delete(k);
  }
}

export type CaptchaTile = { id: string; emoji: string; label: string };

export type CaptchaChallenge = {
  challengeId: string;
  question: string;
  kind: 'pick' | 'math';
  tiles?: CaptchaTile[];
};

const PICK_POOL: Array<{ id: string; emoji: string; tag: string; label: string }> = [
  { id: 'tree-a', emoji: '🌳', tag: 'tree', label: 'дерево' },
  { id: 'tree-b', emoji: '🌲', tag: 'tree', label: 'ёлка' },
  { id: 'tree-c', emoji: '🌴', tag: 'tree', label: 'пальма' },
  { id: 'car-a', emoji: '🚗', tag: 'car', label: 'машина' },
  { id: 'car-b', emoji: '🚕', tag: 'car', label: 'такси' },
  { id: 'house-a', emoji: '🏠', tag: 'house', label: 'дом' },
  { id: 'house-b', emoji: '🏢', tag: 'house', label: 'здание' },
  { id: 'cat-a', emoji: '🐱', tag: 'cat', label: 'кот' },
  { id: 'cat-b', emoji: '🦁', tag: 'cat', label: 'лев' },
  { id: 'sun-a', emoji: '☀️', tag: 'sun', label: 'солнце' },
  { id: 'star-a', emoji: '⭐', tag: 'star', label: 'звезда' },
  { id: 'fish-a', emoji: '🐟', tag: 'fish', label: 'рыба' },
];

const PICK_TARGETS = [
  { tag: 'tree', title: 'деревья' },
  { tag: 'car', title: 'машины' },
  { tag: 'house', title: 'дома' },
  { tag: 'cat', title: 'животные' },
] as const;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function storeAnswer(challengeId: string, answer: string) {
  const redis = getSharedRedis();
  if (redis) {
    await redis.set(`captcha:${challengeId}`, answer, 'EX', TTL_SEC);
  } else {
    MEM.set(challengeId, { answer, exp: Date.now() + TTL_SEC * 1000 });
  }
}

export async function createCaptchaChallenge(): Promise<CaptchaChallenge> {
  cleanupMem();
  const challengeId = crypto.randomBytes(16).toString('hex');
  const target = PICK_TARGETS[Math.floor(Math.random() * PICK_TARGETS.length)];
  const hits = shuffle(PICK_POOL.filter((t) => t.tag === target.tag)).slice(0, 2);
  const decoys = shuffle(PICK_POOL.filter((t) => t.tag !== target.tag)).slice(0, 4);
  const tiles = shuffle([...hits, ...decoys]).map((t) => ({
    id: `${t.id}-${crypto.randomBytes(2).toString('hex')}`,
    emoji: t.emoji,
    label: t.label,
    tag: t.tag,
  }));
  const correct = tiles.filter((t) => t.tag === target.tag).map((t) => t.id).sort().join(',');
  await storeAnswer(challengeId, `pick:${correct}`);
  return {
    challengeId,
    question: `Выберите все картинки: ${target.title}`,
    kind: 'pick',
    tiles: tiles.map(({ id, emoji, label }) => ({ id, emoji, label })),
  };
}

export type CaptchaVerifyInput = {
  challengeId?: string | null;
  answer?: string | number | null;
  selected?: string[] | null;
  /** Honeypot — must be empty */
  website?: string | null;
};

export type CaptchaVerifyResult =
  | { ok: true; token: string }
  | { ok: false; message: string };

/** Step 1: verify answer and issue single-use token */
export async function solveCaptcha(input: CaptchaVerifyInput): Promise<CaptchaVerifyResult> {
  if (input.website && String(input.website).trim() !== '') {
    return { ok: false, message: 'Проверка не пройдена' };
  }
  const id = String(input.challengeId || '').trim();
  if (!id || id.length < 16) {
    return { ok: false, message: 'Обновите проверку и попробуйте снова' };
  }

  let expected: string | null = null;
  const redis = getSharedRedis();
  if (redis) {
    const key = `captcha:${id}`;
    const stored = await redis.get(key);
    if (stored != null) {
      await redis.del(key);
      expected = String(stored);
    }
  } else {
    const row = MEM.get(id);
    if (row && row.exp >= Date.now()) {
      MEM.delete(id);
      expected = row.answer;
    } else {
      MEM.delete(id);
    }
  }

  if (expected == null) {
    return { ok: false, message: 'Неверный ответ на проверку' };
  }

  let given = '';
  if (expected.startsWith('pick:')) {
    const sel = Array.isArray(input.selected)
      ? input.selected
      : String(input.answer || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    given = `pick:${[...new Set(sel)].sort().join(',')}`;
  } else {
    const rawAnswer = String(input.answer ?? '').trim();
    const num = Number(rawAnswer);
    if (!Number.isFinite(num)) {
      return { ok: false, message: 'Неверный ответ' };
    }
    given = String(num);
  }

  if (given !== expected) {
    return { ok: false, message: 'Неверный ответ на проверку' };
  }

  const token = signToken(id);
  if (redis) {
    await redis.set(`captcha:tok:${token}`, '1', 'EX', TTL_SEC);
  } else {
    MEM.set(`tok:${token}`, { answer: '1', exp: Date.now() + TTL_SEC * 1000 });
  }
  return { ok: true, token };
}

function signToken(challengeId: string) {
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${challengeId}.${Date.now()}.${nonce}`;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 32);
  return `${payload}.${sig}`;
}

/** Consume one-time token (register / apply / contest). */
export async function consumeCaptchaToken(
  token: string | null | undefined,
  honeypot?: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (honeypot && String(honeypot).trim() !== '') {
    return { ok: false, message: 'Проверка не пройдена' };
  }
  const t = String(token || '').trim();
  if (!t || t.length < 20) {
    return { ok: false, message: 'Пройдите проверку «я не робот»' };
  }
  const parts = t.split('.');
  if (parts.length < 4) {
    return { ok: false, message: 'Пройдите проверку заново' };
  }
  const payload = parts.slice(0, -1).join('.');
  const sig = parts[parts.length - 1];
  const expect = crypto.createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 32);
  if (sig !== expect) {
    return { ok: false, message: 'Пройдите проверку заново' };
  }

  const redis = getSharedRedis();
  if (redis) {
    const key = `captcha:tok:${t}`;
    const n = await redis.del(key);
    if (!n) return { ok: false, message: 'Проверка устарела — решите пример снова' };
  } else {
    cleanupMem();
    const key = `tok:${t}`;
    if (!MEM.has(key)) return { ok: false, message: 'Проверка устарела — решите пример снова' };
    MEM.delete(key);
  }
  return { ok: true };
}
