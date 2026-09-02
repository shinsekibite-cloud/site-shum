/** Cyrillic → Latin slug helpers for stable URL ids (Node scripts). */

const MAP = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

export function transliterateSlug(input, maxLen = 48) {
  const out = String(input || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split('')
    .map((ch) => {
      if (MAP[ch] !== undefined) return MAP[ch];
      if (/[a-z0-9]/.test(ch)) return ch;
      return '_';
    })
    .join('')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, maxLen);
  return out || 'item';
}

export function projectIdFromTitle(title) {
  return `crm_proj_${transliterateSlug(title, 48)}`;
}

export function latinProjectIdFromAny(idOrTitle) {
  const raw = String(idOrTitle || '').trim();
  if (!raw) return 'crm_proj_item';
  if (raw.startsWith('crm_proj_')) {
    return `crm_proj_${transliterateSlug(raw.slice('crm_proj_'.length), 48)}`;
  }
  return projectIdFromTitle(raw);
}

export function hasNonAsciiId(id) {
  return /[^\x00-\x7F]/.test(String(id || ''));
}
