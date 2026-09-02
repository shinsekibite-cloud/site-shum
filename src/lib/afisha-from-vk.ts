import {
  DEFAULT_AFISHA_WEEK,
  type AfishaWeekConfig,
  serializeAfishaWeek,
} from '@/lib/afisha-week';

/** Detect weekly bulletin posts from VK wall text. */
export function isAfishaWeekPost(text: string): boolean {
  const t = (text || '').toLowerCase();
  return (
    t.includes('#афишанедели') ||
    ((/⚡?\s*афиша\s*⚡?/i.test(text) || t.includes('афиша')) && t.includes('#афиша'))
  );
}

/** Normalize weird VK spaces/dashes before matching phones. */
function normalizeDigitsChunk(s: string) {
  return s
    .replace(/[\u00a0\u202f\u2009]/g, ' ')
    .replace(/[‑–—]/g, '-')
    .replace(/\s+/g, ' ');
}

const PHONE_RE =
  /(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/;

/**
 * Weekly afisha from VK: keep curated CRM cards (titles/CTAs),
 * only refresh period / venues / contact / links from the wall post.
 * Raw VK parsing of bullet lines was gluing HTML and breaking the standard.
 */
export function parseAfishaWeekFromVkText(
  text: string,
  meta?: { vkLink?: string; periodHint?: string; coverImage?: string }
): AfishaWeekConfig {
  const raw = String(text || '');
  const normalized = normalizeDigitsChunk(raw);
  const lines = normalized
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const periodMatch =
    normalized.match(/(\d{2}\/\d{2}\s*[—\-–]\s*\d{2}\/\d{2})/) ||
    normalized.match(/(\d{1,2}[./]\d{1,2}\s*[—\-–]\s*\d{1,2}[./]\d{1,2})/);
  const period = (meta?.periodHint || periodMatch?.[1] || DEFAULT_AFISHA_WEEK.period).replace(/-/g, '—');

  const placeLine = lines.find((l) => /навагин|тимиряз|дом\s*молодеж|молодежн/i.test(l));
  let subtitle = placeLine
    ? placeLine
        .replace(/^#афиша\s*/i, '')
        .replace(/^▫\s*/, '')
        .replace(/\s+на\s+следующую\s+неделю\s*$/i, '')
        .trim()
        .slice(0, 240)
    : DEFAULT_AFISHA_WEEK.subtitle;
  if (/навагин/i.test(subtitle) && /тимиряз/i.test(subtitle)) {
    subtitle = DEFAULT_AFISHA_WEEK.subtitle;
  }

  const contactLine = lines.find(
    (l) => /вопрос|мах|max|администратор/i.test(l) && PHONE_RE.test(normalizeDigitsChunk(l))
  );
  const contactPhone = contactLine?.match(PHONE_RE)?.[0];
  let contactNote = DEFAULT_AFISHA_WEEK.contactNote;
  if (contactPhone) {
    let digits = contactPhone.replace(/[^\d+]/g, '');
    if (digits.startsWith('8') && digits.length === 11) digits = `+7${digits.slice(1)}`;
    if (!digits.startsWith('+') && digits.startsWith('7')) digits = `+${digits}`;
    contactNote = `Вопросы — в MAX администратору Дома молодёжи: ${digits}`;
  }

  const rulesLink =
    (normalized.match(/https?:\/\/t\.me\/crm_sochi\/\d+/i) || [])[0] || DEFAULT_AFISHA_WEEK.rulesLink;

  return {
    ...DEFAULT_AFISHA_WEEK,
    period,
    subtitle,
    vkLink: meta?.vkLink || DEFAULT_AFISHA_WEEK.vkLink,
    contactNote,
    rulesLink,
    coverImage: meta?.coverImage || DEFAULT_AFISHA_WEEK.coverImage,
    items: DEFAULT_AFISHA_WEEK.items.map((i) => ({ ...i })),
  };
}

export function afishaWeekJsonFromVkText(
  text: string,
  meta?: { vkLink?: string; coverImage?: string }
): string {
  return serializeAfishaWeek(parseAfishaWeekFromVkText(text, meta));
}
