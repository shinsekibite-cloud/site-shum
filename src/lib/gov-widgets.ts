/** Homepage government / regulator widgets (Gosuslugi, POS, etc.) */

export type GovWidgetKind = 'iframe' | 'link';

export type GovWidget = {
  id: string;
  title: string;
  enabled: boolean;
  kind: GovWidgetKind;
  /** https URL — iframe src or external link */
  url: string;
  note?: string;
};

const GOV_HOST_SUFFIXES = [
  'gosuslugi.ru',
  'pos.gosuslugi.ru',
  'culture.ru',
  'government.ru',
  'minobr.gov.ru',
  'edu.gov.ru',
  'minobrnauki.gov.ru',
  'sochi.ru',
  'krasnodar.ru',
  'admgor.sochi.ru',
];

/** VK mini-apps / community tools — only as links, never as iframes. */
const LINK_ONLY_HOST_SUFFIXES = ['vk.com', 'vk.ru'];

export const DEFAULT_GOV_WIDGETS: GovWidget[] = [
  {
    id: 'gosuslugi-pos',
    title: 'Обратная связь',
    enabled: true,
    kind: 'link',
    url: 'https://pos.gosuslugi.ru/form/?opaId=223418&utm_source=vk&utm_medium=03&utm_campaign=1032311673074',
    note: 'Оставить обращение через ПОС Госуслуг',
  },
  {
    id: 'gosuslugi',
    title: 'Госуслуги в VK',
    enabled: true,
    kind: 'link',
    url: 'https://vk.ru/app8181405?ref=group_menu',
    note: 'Мини-приложение Госуслуг в сообществе',
  },
  {
    id: 'gov-extra',
    title: 'Портал Госуслуг',
    enabled: false,
    kind: 'link',
    url: 'https://www.gosuslugi.ru/',
    note: 'Дополнительная ссылка при необходимости',
  },
];

function hostAllowed(host: string, suffixes: string[]) {
  return suffixes.some((d) => host === d || host.endsWith(`.${d}`));
}

export function isAllowedGovUrl(raw: string, kind: GovWidgetKind = 'link'): boolean {
  const s = (raw || '').trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (hostAllowed(host, GOV_HOST_SUFFIXES)) return true;
    // VK apps only as external links (not embeddable iframes)
    if (kind === 'link' && hostAllowed(host, LINK_ONLY_HOST_SUFFIXES)) return true;
    return false;
  } catch {
    return false;
  }
}

export function parseGovWidgetsJson(raw?: string | null): GovWidget[] {
  if (!raw || !raw.trim()) return DEFAULT_GOV_WIDGETS.map((w) => ({ ...w }));
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_GOV_WIDGETS.map((w) => ({ ...w }));
    const byId = new Map<string, GovWidget>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const id = String(o.id || '').trim();
      if (!id) continue;
      const kind: GovWidgetKind = o.kind === 'iframe' ? 'iframe' : 'link';
      byId.set(id, {
        id,
        title: String(o.title || id).slice(0, 120),
        enabled: Boolean(o.enabled),
        kind,
        url: String(o.url || '').trim().slice(0, 2000),
        note: o.note ? String(o.note).slice(0, 400) : undefined,
      });
    }
    // Merge with defaults so admin always sees 3 slots
    return DEFAULT_GOV_WIDGETS.map((def) => {
      const cur = byId.get(def.id);
      return cur ? { ...def, ...cur, id: def.id } : { ...def };
    });
  } catch {
    return DEFAULT_GOV_WIDGETS.map((w) => ({ ...w }));
  }
}

export function serializeGovWidgets(widgets: GovWidget[]): string {
  return JSON.stringify(
    widgets.map((w) => ({
      id: w.id,
      title: w.title,
      enabled: w.enabled,
      kind: w.kind,
      url: w.url,
      note: w.note || '',
    }))
  );
}

export function activeGovWidgets(widgets: GovWidget[]): GovWidget[] {
  return widgets.filter((w) => {
    if (!w.enabled || !w.url.trim()) return false;
    // Force VK URLs to link mode for safety
    const kind: GovWidgetKind = w.kind === 'iframe' ? 'iframe' : 'link';
    try {
      const host = new URL(w.url).hostname.toLowerCase().replace(/^www\./, '');
      if (hostAllowed(host, LINK_ONLY_HOST_SUFFIXES) && kind === 'iframe') return false;
    } catch {
      return false;
    }
    return isAllowedGovUrl(w.url, kind);
  });
}
