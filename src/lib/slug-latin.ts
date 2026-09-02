/** Cyrillic → Latin slug helpers for stable URL ids. */

const MAP: Record<string, string> = {
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

export function transliterateSlug(input: string, maxLen = 48): string {
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

export function projectIdFromTitle(title: string): string {
  return `crm_proj_${transliterateSlug(title, 48)}`;
}

export function hasNonAsciiId(id: string): boolean {
  return /[^\x00-\x7F]/.test(id);
}
