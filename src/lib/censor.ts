/**
 * Content safety scanner for YoungPortal messages.
 * Detects profanity, violence, extremism/terrorism, hate — returns masked text + categories.
 * Public CMS still uses assertCleanText (hard block). Messages use soft mask + moderation flags.
 */

export type SafetyCategory =
  | 'PROFANITY'
  | 'VIOLENCE'
  | 'EXTREMISM'
  | 'HATE'
  | 'THREAT'
  | 'IMAGE_REVIEW'
  | 'PROFILE_TEXT';

type Rule = {
  category: SafetyCategory;
  severity: 1 | 2 | 3;
  stems: string[];
  /** Reliability score delta (negative) */
  reliabilityDelta: number;
};

const RULES: Rule[] = [
  {
    category: 'PROFANITY',
    severity: 1,
    reliabilityDelta: -2,
    stems: [
      'бля', 'блять', 'бляд', 'блят', 'блля',
      'хуй', 'хуя', 'хуе', 'хуё', 'хуи', 'хую',
      'пизд', 'пезд',
      'ебал', 'ебан', 'ебат', 'еблан', 'ёбал', 'ёбан', 'уеб',
      'сука', 'суки', 'сучк', 'сучар',
      'мудак', 'мудил', 'мудоз',
      'пидор', 'пидар', 'педик',
      'гандон', 'гондон',
      'залуп', 'дроч', 'шлюх', 'шалав', 'мраз',
      'пошелнахуй', 'пошёлнахуй', 'нахуй', 'нахер', 'нахрен',
      'чмо', 'дебил', 'даун', 'идиот', 'тупиц',
      'blya', 'blyat', 'bljat', 'suka', 'suchka',
      'huy', 'hui', 'xyi', 'xyu', 'pizda', 'pizd',
      'mudak', 'mudila', 'pidor', 'pidar', 'ebal', 'eblan', 'yeb',
      'gandon', 'gondon', 'fuck', 'shit', 'bitch', 'asshole', 'dick', 'cunt',
    ],
  },
  {
    category: 'VIOLENCE',
    severity: 2,
    reliabilityDelta: -5,
    stems: [
      'убить', 'убью', 'уберутебя', 'зарежу', 'зарезать',
      'взорву', 'взорвать', 'расстреля', 'избить', 'покалечу',
      'кровьизноса', 'перережу', 'головуоторву',
      'kill you', 'i will kill', 'shoot you', 'blow up',
    ],
  },
  {
    category: 'EXTREMISM',
    severity: 3,
    reliabilityDelta: -15,
    stems: [
      'террор', 'теракт', 'террорист', 'джихад', 'шахид',
      'взорватьшкол', 'взорватьздан', 'заложник',
      'isis', 'игил', 'alqaeda', 'алькаида',
      'terrorist', 'terrorism', 'bomb the',
    ],
  },
  {
    category: 'HATE',
    severity: 2,
    reliabilityDelta: -8,
    stems: [
      'жид', 'хач', 'чурк', 'нигер', 'негрн', 'обезьянчёрн',
      'нацист', 'фашистсвин', 'white power', 'heil hitler',
      'holocaust denial', 'геноциднужн',
    ],
  },
  {
    category: 'THREAT',
    severity: 2,
    reliabilityDelta: -6,
    stems: [
      'найдутебя', 'знаюгден', 'приедешьпожале', 'пожалеешь',
      'будетплохотебе', 'разберёмсясилой',
      'i know where you live', 'you will regret',
    ],
  },
];

const CATEGORY_LABELS: Record<SafetyCategory, string> = {
  PROFANITY: 'Нецензурная лексика',
  VIOLENCE: 'Насилие',
  EXTREMISM: 'Экстремизм / терроризм',
  HATE: 'Разжигание ненависти',
  THREAT: 'Угрозы',
  IMAGE_REVIEW: 'Проверка фото',
  PROFILE_TEXT: 'Текст профиля',
};

export function safetyCategoryLabel(c: SafetyCategory | string) {
  return CATEGORY_LABELS[c as SafetyCategory] || c;
}

function normalizeForCensor(input: string): string {
  return String(input)
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[0]/g, 'о')
    .replace(/[@]/g, 'а')
    .replace(/[\$]/g, 'с')
    .replace(/[*#№%^~`'"\\/|_+\-=.,!?;:()[\]{}<>]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

/** Map each char of compact normalized form back to original index (best-effort). */
function buildIndexMap(original: string): { compact: string; map: number[] } {
  const lower = original.toLowerCase();
  let compact = '';
  const map: number[] = [];
  for (let i = 0; i < lower.length; i++) {
    let ch = lower[i];
    if (ch === '0') ch = 'о';
    if (ch === '@') ch = 'а';
    if (ch === '$') ch = 'с';
    if (/[a-zа-яё0-9]/i.test(ch)) {
      compact += ch;
      map.push(i);
    }
  }
  return { compact, map };
}

export type SafetyHit = {
  category: SafetyCategory;
  severity: 1 | 2 | 3;
  stem: string;
  reliabilityDelta: number;
  start: number;
  end: number;
};

export type SafetyScan = {
  flagged: boolean;
  categories: SafetyCategory[];
  maxSeverity: number;
  reliabilityDelta: number;
  matches: string[];
  hits: SafetyHit[];
  maskedText: string;
};

export function scanUnsafeContent(text: string | null | undefined): SafetyScan {
  const original = String(text || '');
  const empty: SafetyScan = {
    flagged: false,
    categories: [],
    maxSeverity: 0,
    reliabilityDelta: 0,
    matches: [],
    hits: [],
    maskedText: original,
  };
  if (!original.trim()) return empty;

  const { compact, map } = buildIndexMap(original);
  if (!compact) return empty;

  const hits: SafetyHit[] = [];
  const categories = new Set<SafetyCategory>();
  let maxSeverity = 0;
  let reliabilityDelta = 0;
  const matches = new Set<string>();

  for (const rule of RULES) {
    for (const stem of rule.stems) {
      const s = stem.replace(/\s+/g, '');
      if (!s || s.length < 3) continue;
      let from = 0;
      while (from < compact.length) {
        const idx = compact.indexOf(s, from);
        if (idx < 0) break;
        const startOrig = map[idx] ?? 0;
        const endOrig = (map[idx + s.length - 1] ?? startOrig) + 1;
        hits.push({
          category: rule.category,
          severity: rule.severity,
          stem: s,
          reliabilityDelta: rule.reliabilityDelta,
          start: startOrig,
          end: endOrig,
        });
        categories.add(rule.category);
        matches.add(s);
        maxSeverity = Math.max(maxSeverity, rule.severity);
        reliabilityDelta = Math.min(reliabilityDelta, rule.reliabilityDelta);
        from = idx + Math.max(1, s.length);
      }
    }
  }

  if (hits.length === 0) return empty;

  // Merge overlapping ranges and mask
  const ranges = hits
    .map((h) => [h.start, h.end] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of ranges) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }

  let masked = '';
  let cursor = 0;
  for (const [a, b] of merged) {
    masked += original.slice(cursor, a);
    const span = original.slice(a, b);
    masked += span.replace(/\S/g, '•');
    cursor = b;
  }
  masked += original.slice(cursor);

  return {
    flagged: true,
    categories: [...categories],
    maxSeverity,
    reliabilityDelta,
    matches: [...matches],
    hits,
    maskedText: masked,
  };
}

export function containsProfanity(text: string | null | undefined): boolean {
  const scan = scanUnsafeContent(text);
  return scan.flagged && scan.categories.includes('PROFANITY');
}

/** True if any safety category matches (used by CMS hard-block). */
export function containsUnsafeContent(text: string | null | undefined): boolean {
  return scanUnsafeContent(text).flagged;
}

export class ProfanityError extends Error {
  constructor(
    message = 'Текст содержит недопустимые выражения. Уберите нецензурную лексику.'
  ) {
    super(message);
    this.name = 'ProfanityError';
  }
}

export function assertCleanText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (containsUnsafeContent(value)) throw new ProfanityError();
  }
}

export function profanityResponse(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (containsUnsafeContent(value)) {
      return Response.json(
        {
          message:
            'Текст содержит недопустимые выражения. Уберите нецензурную лексику и запрещённый контент.',
        },
        { status: 400 }
      );
    }
  }
  return null;
}
