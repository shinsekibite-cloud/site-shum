/**
 * User-facing labels for youth points.
 * Internal fields stay ecoPoints / mBall / ecoBall — only copy changes.
 */
export const POINTS = {
  /** Spendable shop currency (ecoPoints) */
  shop: {
    brand: 'мбаллы',
    short: 'мб',
    genitive: 'мбаллов',
    dative: 'мбаллам',
    accusative: 'мбаллы',
    capital: 'Мбаллы',
    wallet: 'М-кошелёк',
    pool: 'М-пул',
  },
  /** Participation reputation (mBall) */
  mBall: {
    brand: 'М-балл',
    short: 'М',
  },
  /** Eco-tagged event reputation (ecoBall) — not shop currency */
  ecoBall: {
    brand: 'Зелёный балл',
    short: 'Зел.',
  },
} as const;

/** «N мбаллов» with simple Russian pluralization. */
export function shopPointsAmount(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} мбалл`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} мбалла`;
  return `${n} мбаллов`;
}

export function needShopPoints(n: number): string {
  return `Нужно ${shopPointsAmount(n)}`;
}
