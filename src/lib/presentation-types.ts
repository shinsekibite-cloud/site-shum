export type PresentationSlide = {
  id: string;
  kicker?: string;
  title: string;
  lead?: string;
  /** Spoken line for video (plain language). Falls back to title + lead. */
  narration?: string;
  bullets?: string[];
  cards?: { title: string; text: string }[];
  image?: string | null;
  /** Legacy; player shows contactLine instead. */
  footer?: string;
};

export type PresentationDeck = {
  slug: 'full' | 'necessary';
  title: string;
  subtitle?: string;
  slides: PresentationSlide[];
  updatedAt?: string;
  /** Minimal contacts under every slide */
  contacts?: string;
};

export const DECK_SLUGS = ['full', 'necessary'] as const;
export type DeckSlug = (typeof DECK_SLUGS)[number];

export function isDeckSlug(v: string): v is DeckSlug {
  return (DECK_SLUGS as readonly string[]).includes(v);
}

export const DEFAULT_PRESENTATION_CONTACTS =
  '8 (862) 253-32-37 · cddim_sochi@mail.ru';
