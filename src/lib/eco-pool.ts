/**
 * Global eco-points pool (1_000_000 default).
 * Issued = sum of positive ECO reputation deltas.
 * Held = sum of current user balances.
 * Spent = issued − held (shop purchases etc.).
 * Remaining = total − issued.
 */
import { prisma } from '@/lib/prisma';
import { ECO } from '@/lib/eco-points';

export type EcoPoolConfig = {
  total: number;
  /** Soft counter in shop / profile (default on) */
  showInShop: boolean;
  /** Tiny footer hint (default off — less noisy) */
  showInFooter: boolean;
  /** Admin dashboard always can see via API */
  notes?: string;
};

export type EcoPoolStats = {
  total: number;
  issued: number;
  held: number;
  spent: number;
  remaining: number;
  showInShop: boolean;
  showInFooter: boolean;
};

export const ECO_POOL_DEFAULTS: EcoPoolConfig = {
  total: ECO.MAX,
  showInShop: true,
  showInFooter: false,
  notes: '',
};

const ECO_POOL_TTL_MS = 60_000;
let ecoPoolMem: { at: number; data: EcoPoolStats } | null = null;

export function parseEcoPoolJson(raw: unknown): EcoPoolConfig {
  const base = { ...ECO_POOL_DEFAULTS };
  if (!raw) return base;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || typeof data !== 'object') return base;
    const total = Number((data as EcoPoolConfig).total);
    if (Number.isFinite(total) && total >= 1000) {
      base.total = Math.min(100_000_000, Math.floor(total));
    }
    if (typeof (data as EcoPoolConfig).showInShop === 'boolean') {
      base.showInShop = (data as EcoPoolConfig).showInShop;
    }
    if (typeof (data as EcoPoolConfig).showInFooter === 'boolean') {
      base.showInFooter = (data as EcoPoolConfig).showInFooter;
    }
    if (typeof (data as EcoPoolConfig).notes === 'string') {
      base.notes = String((data as EcoPoolConfig).notes || '').slice(0, 500);
    }
  } catch {
    /* keep defaults */
  }
  return base;
}

export function serializeEcoPoolJson(cfg: EcoPoolConfig): string {
  return JSON.stringify({
    total: cfg.total,
    showInShop: cfg.showInShop,
    showInFooter: cfg.showInFooter,
    notes: cfg.notes || '',
  });
}

export async function getEcoPoolStats(): Promise<EcoPoolStats> {
  const now = Date.now();
  if (ecoPoolMem && now - ecoPoolMem.at < ECO_POOL_TTL_MS) {
    return ecoPoolMem.data;
  }

  const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } }).catch(() => null);
  const cfg = parseEcoPoolJson(
    (settings as { ecoPoolJson?: string | null } | null)?.ecoPoolJson
  );

  const heldAgg = await prisma.user
    .aggregate({
      _sum: { ecoPoints: true },
      where: { deletedAt: null },
    })
    .catch(() => ({ _sum: { ecoPoints: null as number | null } }));

  const held = Math.max(0, heldAgg._sum.ecoPoints ?? 0);

  let issuedPos = 0;
  let spentAbs = 0;
  try {
    const [pos, neg] = await Promise.all([
      prisma.reputationEvent.aggregate({
        where: { kind: 'ECO', delta: { gt: 0 } },
        _sum: { delta: true },
      }),
      prisma.reputationEvent.aggregate({
        where: { kind: 'ECO', delta: { lt: 0 } },
        _sum: { delta: true },
      }),
    ]);
    issuedPos = Math.max(0, pos._sum.delta ?? 0);
    spentAbs = Math.max(0, -(neg._sum.delta ?? 0));
  } catch {
    issuedPos = held;
    spentAbs = 0;
  }

  const issued = Math.max(issuedPos, held + spentAbs);
  const spent = Math.max(spentAbs, Math.max(0, issued - held));
  const remaining = Math.max(0, cfg.total - issued);

  const data: EcoPoolStats = {
    total: cfg.total,
    issued,
    held,
    spent,
    remaining,
    showInShop: cfg.showInShop,
    showInFooter: cfg.showInFooter,
  };
  ecoPoolMem = { at: Date.now(), data };
  return data;
}

/** Drop in-process pool cache after admin resets / grants. */
export function invalidateEcoPoolCache() {
  ecoPoolMem = null;
}

/** How many points can still be granted from the pool. */
export async function ecoPoolRemaining(): Promise<number> {
  const s = await getEcoPoolStats();
  return s.remaining;
}
