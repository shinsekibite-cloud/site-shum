/**
 * Eco-points («Забота о планете») — earn for good actions, spend on cosmetics & packs.
 */
import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logReputationEvent } from '@/lib/reputation-history';
import {
  LOADOUT_SLOTS,
  parseEcoLoadout,
  type CosmeticSlot,
  type EcoLoadout,
} from '@/lib/eco-loadout';
import {
  applyDrops,
  CARD_PACKS,
  parseCollectibles,
  rollPack,
  type CardPackId,
  type CollectibleCard,
} from '@/lib/collectibles';

export type { CosmeticSlot, EcoLoadout } from '@/lib/eco-loadout';
export { parseEcoLoadout, SLOT_LABELS, LOADOUT_SLOTS } from '@/lib/eco-loadout';

function runAfterResponse(task: () => void) {
  try {
    after(task);
  } catch {
    task();
  }
}

export type CosmeticItem = {
  cost: number;
  label: string;
  slot: CosmeticSlot;
};

export const ECO = {
  MIN: 0,
  MAX: 1_000_000,
  /** Default starting balance for USER / PARTICIPANT / SCANNER */
  STARTING: 50,
  STARTING_MODERATOR: 500,
  STARTING_ADMIN: 1000,
  CHECK_IN: 15,
  JOIN_EVENT: 5,
  FRIEND_ACCEPT: 4,
  GALLERY_PHOTO: 2,
  APPLICATION_APPROVED: 8,
  ACHIEVEMENT: 6,
  GUIDE_COMPLETE: 20,
  VACANCY_SCREEN_PASS: 10,
  VACANCY_APPROVED: 25,
  CONTEST_SUBMIT: 8,
  CONTEST_APPROVED: 12,
  CONTEST_WIN: 35,
  RAFFLE_WIN: 40,
  /** Once per MSK calendar day for verified game play */
  GAME_DAILY: 3,
  /** Bonus for solving fifteen puzzle (once per MSK day, stacks with GAME_DAILY) */
  FIFTEEN_WIN: 5,
  /** +1 per unique content view (logged-in), capped per MSK day */
  VIEW_UNIQUE: 1,
  VIEW_DAILY_CAP: 5,
  /** Referral program (see lib/referrals.ts for full matrix) */
  REFERRAL_SIGNUP: 8,
  REFERRAL_CHECKIN: 25,
  /** Spend catalog */
  COSMETICS: {
    frame_ocean: { cost: 35, label: 'Рамка «Океан»', slot: 'frame' },
    frame_forest: { cost: 35, label: 'Рамка «Лес»', slot: 'frame' },
    frame_gold: { cost: 55, label: 'Рамка «Золото»', slot: 'frame' },
    frame_neon: { cost: 70, label: 'Рамка «Неон»', slot: 'frame' },
    frame_cyber: { cost: 85, label: 'Рамка «Кибер»', slot: 'frame' },
    badge_leaf: { cost: 20, label: 'Значок «Лист»', slot: 'badge' },
    badge_star: { cost: 30, label: 'Значок «Звезда»', slot: 'badge' },
    badge_wave: { cost: 28, label: 'Значок «Волна»', slot: 'badge' },
    badge_fire: { cost: 42, label: 'Значок «Огонь»', slot: 'badge' },
    theme_aurora: { cost: 70, label: 'Тема профиля «Аврора»', slot: 'theme' },
    theme_forest: { cost: 90, label: 'Тема профиля «Лес»', slot: 'theme' },
    theme_nightcity: { cost: 110, label: 'Тема «Ночной город»', slot: 'theme' },
    theme_harbor: { cost: 95, label: 'Тема «Гавань»', slot: 'theme' },
    ticket_glow: { cost: 40, label: 'Подсветка QR билета', slot: 'ticket' },
    ticket_holo: { cost: 75, label: 'Голографический билет', slot: 'ticket' },
    voice_slavonic: { cost: 55, label: 'Голос: старославянский', slot: 'voice' },
    voice_punk: { cost: 50, label: 'Голос: панк-сленг', slot: 'voice' },
    voice_elite: { cost: 70, label: 'Голос: элитный тон', slot: 'voice' },
    voice_sochi: { cost: 45, label: 'Голос: сочинский', slot: 'voice' },
    voice_youth: { cost: 60, label: 'Голос: молодёжный', slot: 'voice' },
    aura_spark: { cost: 55, label: 'Аура «Искры» у аватара', slot: 'aura' },
    aura_wave: { cost: 65, label: 'Аура «Прибой»', slot: 'aura' },
    banner_sunset: { cost: 65, label: 'Шапка профиля «Закат»', slot: 'banner' },
    banner_sochi: { cost: 80, label: 'Шапка «Сочи 24»', slot: 'banner' },
    cursor_leaf: { cost: 40, label: 'Курсор «Лист»', slot: 'cursor' },
    cursor_star: { cost: 48, label: 'Курсор «Звезда»', slot: 'cursor' },
    frame_pearl: { cost: 95, label: 'Рамка «Жемчуг»', slot: 'frame' },
    badge_compass: { cost: 38, label: 'Значок «Компас»', slot: 'badge' },
    theme_lagoon: { cost: 120, label: 'Тема «Лагуна»', slot: 'theme' },
    aura_ember: { cost: 72, label: 'Аура «Угольки»', slot: 'aura' },
    banner_palms: { cost: 88, label: 'Шапка «Пальмы»', slot: 'banner' },
    ticket_pulse: { cost: 55, label: 'Пульс QR билета', slot: 'ticket' },
  } as Record<string, CosmeticItem>,
} as const;

export type CosmeticId = keyof typeof ECO.COSMETICS;

/** Starting eco by role (USER 50 · MODERATOR 500 · ADMIN/TECH 1000). */
export function startingEcoForRole(role: string | null | undefined): number {
  const r = String(role || 'USER').toUpperCase();
  if (r === 'ADMIN' || r === 'TECH') return ECO.STARTING_ADMIN;
  if (r === 'MODERATOR') return ECO.STARTING_MODERATOR;
  return ECO.STARTING;
}

export function parseCosmetics(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) return [];
    return data.map((x) => String(x)).filter(Boolean).slice(0, 64);
  } catch {
    return [];
  }
}

export function cosmeticsCatalogValue(owned: string[]): number {
  let sum = 0;
  for (const id of owned) {
    const item = ECO.COSMETICS[id as CosmeticId];
    if (item) sum += item.cost;
  }
  return sum;
}

export function cosmeticSlot(id: string): CosmeticSlot | null {
  const item = ECO.COSMETICS[id as CosmeticId];
  return item?.slot ?? null;
}

export async function bumpEcoPoints(
  userId: string,
  delta: number,
  reason: string,
  meta?: Record<string, unknown>
) {
  if (!delta) return null;
  try {
    const { isModuleEnabled } = await import('@/lib/module-flags');
    if (!(await isModuleEnabled('eco'))) return null;
  } catch {
    /* fail-open if flags unavailable */
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ecoPoints: true },
  });
  if (!user) return null;

  let applied = delta;
  if (delta > 0) {
    try {
      const { ecoPoolRemaining } = await import('@/lib/eco-pool');
      const remaining = await ecoPoolRemaining();
      if (remaining <= 0) return null;
      applied = Math.min(delta, remaining);
    } catch {
      /* pool check best-effort — don't block legacy awards */
    }
  }
  if (!applied) return null;

  const next = Math.max(ECO.MIN, Math.min(ECO.MAX, (user.ecoPoints ?? 0) + applied));
  const actualDelta = next - (user.ecoPoints ?? 0);
  if (!actualDelta) return null;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { ecoPoints: next },
    select: { id: true, ecoPoints: true },
  });
  await logReputationEvent({
    userId,
    kind: 'ECO',
    delta: actualDelta,
    balanceAfter: next,
    reason,
    meta,
  });
  return updated;
}

/**
 * Admin / contest grant with explicit pool remaining check and user-facing errors.
 */
export async function grantEcoPoints(
  userId: string,
  amount: number,
  reason: string,
  meta?: Record<string, unknown>
): Promise<{ ok: true; ecoPoints: number } | { ok: false; message: string }> {
  try {
    const { isModuleEnabled } = await import('@/lib/module-flags');
    if (!(await isModuleEnabled('eco'))) {
      return { ok: false, message: 'Модуль мбаллов временно отключён' };
    }
  } catch {
    /* fail-open */
  }
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, message: 'Сумма должна быть ≥ 1' };
  }
  if (n > 50_000) {
    return { ok: false, message: 'За раз не больше 50 000' };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ecoPoints: true, deletedAt: true },
  });
  if (!user || user.deletedAt) {
    return { ok: false, message: 'Пользователь не найден' };
  }

  try {
    const { ecoPoolRemaining } = await import('@/lib/eco-pool');
    const remaining = await ecoPoolRemaining();
    if (remaining < n) {
      return {
        ok: false,
        message: `В пуле осталось ${remaining.toLocaleString('ru-RU')} — меньше, чем ${n}`,
      };
    }
  } catch {
    /* continue without hard fail if pool module unavailable */
  }

  const next = Math.max(ECO.MIN, Math.min(ECO.MAX, (user.ecoPoints ?? 0) + n));
  const actual = next - (user.ecoPoints ?? 0);
  if (actual < 1) {
    return { ok: false, message: 'Достигнут лимит баланса пользователя' };
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { ecoPoints: next },
    select: { ecoPoints: true },
  });
  await logReputationEvent({
    userId,
    kind: 'ECO',
    delta: actual,
    balanceAfter: next,
    reason,
    meta: { ...meta, grant: true },
  });
  return { ok: true, ecoPoints: updated.ecoPoints };
}

export async function spendEcoPoints(userId: string, cosmeticId: string) {
  const item = ECO.COSMETICS[cosmeticId as CosmeticId];
  if (!item) return { ok: false as const, message: 'Неизвестный предмет' };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { ecoPoints: true, cosmeticsJson: true, ecoLoadoutJson: true },
      });
      if (!user) return { ok: false as const, message: 'Пользователь не найден' };
      const owned = parseCosmetics(user.cosmeticsJson);
      if (owned.includes(cosmeticId)) return { ok: false as const, message: 'Уже куплено' };
      if ((user.ecoPoints ?? 0) < item.cost) {
        return { ok: false as const, message: `Нужно ${item.cost} мбаллов` };
      }
      const spent = await tx.user.updateMany({
        where: { id: userId, ecoPoints: { gte: item.cost } },
        data: { ecoPoints: { decrement: item.cost } },
      });
      if (spent.count !== 1) {
        return { ok: false as const, message: `Нужно ${item.cost} мбаллов` };
      }
      const nextOwned = [...owned, cosmeticId];
      const loadout = parseEcoLoadout(user.ecoLoadoutJson);
      loadout[item.slot] = cosmeticId;
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          cosmeticsJson: JSON.stringify(nextOwned),
          ecoLoadoutJson: JSON.stringify(loadout),
        },
        select: { ecoPoints: true },
      });
      return {
        ok: true as const,
        ecoPoints: updated.ecoPoints,
        cosmetics: nextOwned,
        loadout,
        cost: item.cost,
        label: item.label,
      };
    });

    if (!result.ok) return result;
    runAfterResponse(() => {
      void logReputationEvent({
        userId,
        kind: 'ECO',
        delta: -result.cost,
        balanceAfter: result.ecoPoints,
        reason: `Покупка: ${result.label}`,
        meta: { cosmeticId, autoEquipped: true },
      });
      void import('@/lib/security')
        .then(({ createUserNotification }) =>
          createUserNotification({
            userId,
            type: 'ECO',
            title: 'Покупка за мбаллы',
            body: `«${result.label}» за ${result.cost} мб. Предмет надет на профиль.`,
            meta: { href: '/dashboard/shop', kind: 'eco_purchase', cosmeticId },
          })
        )
        .catch(() => null);
    });
    return {
      ok: true as const,
      ecoPoints: result.ecoPoints,
      cosmetics: result.cosmetics,
      loadout: result.loadout,
    };
  } catch (e) {
    console.error('spendEcoPoints', e);
    return { ok: false as const, message: 'Не удалось оформить покупку' };
  }
}

export async function openCardPack(userId: string, packId: string) {
  if (!(packId in CARD_PACKS)) {
    return { ok: false as const, message: 'Неизвестный пак' };
  }
  const pack = CARD_PACKS[packId as CardPackId];
  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { ecoPoints: true, collectiblesJson: true },
      });
      if (!user) return { ok: false as const, message: 'Пользователь не найден' };
      if ((user.ecoPoints ?? 0) < pack.cost) {
        return { ok: false as const, message: `Нужно ${pack.cost} мбаллов` };
      }
      const spent = await tx.user.updateMany({
        where: { id: userId, ecoPoints: { gte: pack.cost } },
        data: { ecoPoints: { decrement: pack.cost } },
      });
      if (spent.count !== 1) {
        return { ok: false as const, message: `Нужно ${pack.cost} мбаллов` };
      }
      const prev = parseCollectibles(user.collectiblesJson);
      const drops = rollPack(pack.id, { pity: prev.pity || 0 });
      const nextState = applyDrops(prev, drops);
      const updated = await tx.user.update({
        where: { id: userId },
        data: { collectiblesJson: JSON.stringify(nextState) },
        select: { ecoPoints: true },
      });
      return {
        ok: true as const,
        ecoPoints: updated.ecoPoints,
        collectibles: nextState,
        drops,
        pack,
        cost: pack.cost,
        label: pack.label,
      };
    });
    if (!result.ok) return result;
    const dropNames = result.drops.map((d) => d.title || d.id).slice(0, 4).join(', ');
    runAfterResponse(() => {
      void logReputationEvent({
        userId,
        kind: 'ECO',
        delta: -result.cost,
        balanceAfter: result.ecoPoints,
        reason: `Пак: ${result.label}`,
        meta: { packId: result.pack.id, drops: result.drops.map((d) => d.id) },
      });
      void import('@/lib/security')
        .then(({ createUserNotification }) =>
          createUserNotification({
            userId,
            type: 'ECO',
            title: 'Пак карт за мбаллы',
            body: `«${result.label}» за ${result.cost} мб${dropNames ? `. Выпало: ${dropNames}` : ''}.`,
            meta: { href: '/dashboard/shop', kind: 'eco_pack', packId: result.pack.id },
          })
        )
        .catch(() => null);
    });
    return {
      ok: true as const,
      ecoPoints: result.ecoPoints,
      collectibles: result.collectibles,
      drops: result.drops,
      pack: result.pack,
    };
  } catch (e) {
    console.error('openCardPack', e);
    return { ok: false as const, message: 'Не удалось открыть пак' };
  }
}

export async function setCardShowcase(userId: string, showcase: string[]) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { collectiblesJson: true, ecoPoints: true },
  });
  if (!user) return { ok: false as const, message: 'Пользователь не найден' };
  const state = parseCollectibles(user.collectiblesJson);
  const nextShowcase = showcase
    .map((x) => String(x))
    .filter((id) => state.cards[id])
    .slice(0, 5);
  const next = { ...state, showcase: nextShowcase, updatedAt: new Date().toISOString() };
  await prisma.user.update({
    where: { id: userId },
    data: { collectiblesJson: JSON.stringify(next) },
  });
  return { ok: true as const, collectibles: next, ecoPoints: user.ecoPoints ?? 0 };
}

export async function equipCosmetic(userId: string, cosmeticId: string) {
  const item = ECO.COSMETICS[cosmeticId as CosmeticId];
  if (!item) return { ok: false as const, message: 'Неизвестный предмет' };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { cosmeticsJson: true, ecoLoadoutJson: true, ecoPoints: true },
  });
  if (!user) return { ok: false as const, message: 'Пользователь не найден' };
  const owned = parseCosmetics(user.cosmeticsJson);
  if (!owned.includes(cosmeticId)) {
    return { ok: false as const, message: 'Сначала купите этот предмет' };
  }
  const loadout = parseEcoLoadout(user.ecoLoadoutJson);
  loadout[item.slot] = cosmeticId;
  await prisma.user.update({
    where: { id: userId },
    data: { ecoLoadoutJson: JSON.stringify(loadout) },
  });
  return {
    ok: true as const,
    ecoPoints: user.ecoPoints ?? 0,
    cosmetics: owned,
    loadout,
  };
}

export async function unequipCosmetic(userId: string, slot: string) {
  if (!LOADOUT_SLOTS.includes(slot as CosmeticSlot)) {
    return { ok: false as const, message: 'Неизвестный слот' };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { cosmeticsJson: true, ecoLoadoutJson: true, ecoPoints: true },
  });
  if (!user) return { ok: false as const, message: 'Пользователь не найден' };
  const loadout = parseEcoLoadout(user.ecoLoadoutJson);
  loadout[slot as CosmeticSlot] = null;
  await prisma.user.update({
    where: { id: userId },
    data: { ecoLoadoutJson: JSON.stringify(loadout) },
  });
  return {
    ok: true as const,
    ecoPoints: user.ecoPoints ?? 0,
    cosmetics: parseCosmetics(user.cosmeticsJson),
    loadout,
  };
}

export type { CollectibleCard };
