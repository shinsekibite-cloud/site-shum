import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_PRESENTATION_CONTACTS,
  type DeckSlug,
  type PresentationDeck,
} from '@/lib/presentation-types';
import { defaultFullDeck, defaultNecessaryDeck } from '@/lib/presentation-defaults';

function deckDir(slug: DeckSlug) {
  const folder = slug === 'full' ? 'deck' : 'necessary';
  return join(process.cwd(), 'public', 'presentation', folder);
}

export function slidesPath(slug: DeckSlug) {
  return join(deckDir(slug), 'slides.json');
}

export function readDeck(slug: DeckSlug): PresentationDeck {
  const path = slidesPath(slug);
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as PresentationDeck;
      if (raw?.slides?.length) {
        return {
          ...raw,
          contacts: (raw.contacts || '').trim() || DEFAULT_PRESENTATION_CONTACTS,
        };
      }
    } catch {
      /* fall through */
    }
  }
  return slug === 'full' ? defaultFullDeck() : defaultNecessaryDeck();
}

export function writeDeck(deck: PresentationDeck): PresentationDeck {
  const dir = deckDir(deck.slug);
  mkdirSync(dir, { recursive: true });
  const next: PresentationDeck = {
    ...deck,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(slidesPath(deck.slug), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function uploadsDir(slug: DeckSlug) {
  const dir = join(deckDir(slug), 'media', 'uploads');
  mkdirSync(dir, { recursive: true });
  return dir;
}
