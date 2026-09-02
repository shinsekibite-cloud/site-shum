/**
 * Remember Telegram / MAX moderation card message ids so we can edit them
 * when someone decides from admin UI or another messenger.
 * Prefers Redis; falls back to process memory.
 */
import { getSharedRedis } from '@/lib/rateLimit';

export type ModerationCardRef = {
  channel: 'TELEGRAM' | 'MAX';
  chatId: string;
  messageId: string;
};

const TTL_SEC = 60 * 60 * 24 * 45; // 45 days
const mem = new Map<string, { refs: ModerationCardRef[]; exp: number }>();

function key(kind: 'book' | 'app', entityId: string) {
  return `yp:modcard:${kind}:${entityId}`;
}

function uniq(refs: ModerationCardRef[]): ModerationCardRef[] {
  const seen = new Set<string>();
  const out: ModerationCardRef[] = [];
  for (const r of refs) {
    const k = `${r.channel}:${r.chatId}:${r.messageId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.slice(-40);
}

export async function rememberModerationCard(
  kind: 'book' | 'app',
  entityId: string,
  ref: ModerationCardRef
): Promise<void> {
  if (!entityId || !ref.messageId || !ref.chatId) return;
  const k = key(kind, entityId);
  const existing = await listModerationCards(kind, entityId);
  const next = uniq([...existing, ref]);

  const redis = getSharedRedis();
  if (redis) {
    try {
      await redis.set(k, JSON.stringify(next), 'EX', TTL_SEC);
      return;
    } catch (e) {
      console.warn('[moderation-cards] redis set', e);
    }
  }
  mem.set(k, { refs: next, exp: Date.now() + TTL_SEC * 1000 });
}

export async function listModerationCards(
  kind: 'book' | 'app',
  entityId: string
): Promise<ModerationCardRef[]> {
  const k = key(kind, entityId);
  const redis = getSharedRedis();
  if (redis) {
    try {
      const raw = await redis.get(k);
      if (raw) {
        const parsed = JSON.parse(raw) as ModerationCardRef[];
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.warn('[moderation-cards] redis get', e);
    }
  }
  const row = mem.get(k);
  if (!row) return [];
  if (Date.now() > row.exp) {
    mem.delete(k);
    return [];
  }
  return row.refs;
}

export async function clearModerationCards(kind: 'book' | 'app', entityId: string): Promise<void> {
  const k = key(kind, entityId);
  const redis = getSharedRedis();
  if (redis) {
    try {
      await redis.del(k);
    } catch {
      /* ignore */
    }
  }
  mem.delete(k);
}
