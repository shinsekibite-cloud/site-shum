/** Weekly afisha (club sign-ups / week bulletin from VK). */

export type AfishaActionKind = 'phone' | 'telegram' | 'link' | 'text';

export type AfishaWeekItem = {
  id: string;
  title: string;
  place?: string;
  action: AfishaActionKind;
  /** phone number, @username, t.me link, or https URL */
  value?: string;
  /** Button label override */
  label?: string;
  note?: string;
};

export type AfishaWeekConfig = {
  title: string;
  subtitle: string;
  period: string;
  vkLink: string;
  contactNote: string;
  rulesLink: string;
  /** Optional poster image from VK /uploads or CDN */
  coverImage?: string;
  items: AfishaWeekItem[];
};

/** Default from https://vk.ru/wall-211213539_9710 — curated, not raw parser dump */
export const DEFAULT_AFISHA_WEEK: AfishaWeekConfig = {
  title: 'Афиша недели',
  subtitle: 'Дом молодёжи (Навагинская, 9) и Молодёжный центр (Тимирязева, 6)',
  period: '03/08 — 09/08',
  vkLink: 'https://vk.ru/wall-211213539_9710',
  contactNote: 'Вопросы — в MAX администратору Дома молодёжи: +7 988 236-50-22',
  rulesLink: 'https://t.me/crm_sochi/26243',
  coverImage: '/brand/afisha-week.svg',
  items: [
    {
      id: 'gym',
      title: 'Гимнастика',
      place: 'Запись по телефону',
      action: 'phone',
      value: '+79183048588',
      label: 'Позвонить',
    },
    {
      id: 'young-family',
      title: 'Клуб «Молодая семья»',
      place: 'Молодёжный центр · для детей с ОВЗ',
      action: 'phone',
      value: '+79631642397',
      label: 'Наталья',
    },
    {
      id: 'clubs-bot',
      title: '«Новое время», «Нити», «Амплитуда»',
      place: 'Запись через Telegram-бот',
      action: 'telegram',
      value: 'https://t.me/crm_molodsochi_bot',
      label: '@crm_molodsochi_bot',
    },
    {
      id: 'mma',
      title: 'ММА / рукопашный бой',
      place: 'Запись по ссылке',
      action: 'telegram',
      value: 'https://t.me/+QMfAe7ELGrcyZDZi',
      label: 'Записаться',
    },
    {
      id: 'film',
      title: 'Обсуждение фильма',
      place: 'Молодёжный центр',
      action: 'link',
      value: 'https://forms.yandex.ru/cloud/69f75cfc6d2d736ad9321aba',
      label: 'Анкета',
    },
    {
      id: 'vocal',
      title: 'Вокал / гитара',
      place: 'Молодёжный центр',
      action: 'telegram',
      value: 'https://t.me/+cmHtvAv0Zm82MGZi',
      label: 'Записаться',
    },
  ],
};

const ACTION_KINDS: AfishaActionKind[] = ['phone', 'telegram', 'link', 'text'];

function healContactNote(raw: unknown): string {
  let s = String(raw || '').trim();
  if (!s) return DEFAULT_AFISHA_WEEK.contactNote;
  // VK OCR / weird encodings turn MAX → МАХ; normalize
  s = s.replace(/МАХ/gi, 'MAX').replace(/\s+/g, ' ').slice(0, 400);
  if (/пишите\s+или\s+звоните/i.test(s) || !/\+?\d/.test(s)) {
    const phone = s.match(/(?:\+7|8)[\d\s\-()]{10,}/)?.[0];
    if (phone) {
      let digits = phone.replace(/[^\d+]/g, '');
      if (digits.startsWith('8') && digits.length === 11) digits = `+7${digits.slice(1)}`;
      return `Вопросы — в MAX администратору Дома молодёжи: ${digits}`;
    }
    return DEFAULT_AFISHA_WEEK.contactNote;
  }
  return s;
}

function cleanAction(raw: unknown): AfishaActionKind {
  const s = String(raw || '');
  return ACTION_KINDS.includes(s as AfishaActionKind) ? (s as AfishaActionKind) : 'text';
}

export function parseAfishaWeekJson(raw?: string | null): AfishaWeekConfig {
  if (!raw || !raw.trim()) return { ...DEFAULT_AFISHA_WEEK, items: DEFAULT_AFISHA_WEEK.items.map((i) => ({ ...i })) };
  try {
    if (isBrokenAfishaWeekJson(raw)) {
      const broken = JSON.parse(raw) as Partial<AfishaWeekConfig>;
      return {
        ...DEFAULT_AFISHA_WEEK,
        period: String(broken.period || DEFAULT_AFISHA_WEEK.period).slice(0, 80),
        vkLink: String(broken.vkLink || DEFAULT_AFISHA_WEEK.vkLink).slice(0, 500),
        items: DEFAULT_AFISHA_WEEK.items.map((i) => ({ ...i })),
      };
    }
    const parsed = JSON.parse(raw) as Partial<AfishaWeekConfig>;
    const itemsIn = Array.isArray(parsed.items) ? parsed.items : [];
    const items: AfishaWeekItem[] = itemsIn
      .map((item, idx) => {
        if (!item || typeof item !== 'object') return null;
        const o = item as Record<string, unknown>;
        const title = String(o.title || '').trim().slice(0, 160);
        if (!title) return null;
        return {
          id: String(o.id || `item_${idx}`).slice(0, 64),
          title,
          place: o.place ? String(o.place).slice(0, 160) : undefined,
          action: cleanAction(o.action),
          value: o.value ? String(o.value).trim().slice(0, 2000) : undefined,
          label: o.label ? String(o.label).slice(0, 80) : undefined,
          note: o.note ? String(o.note).slice(0, 200) : undefined,
        } satisfies AfishaWeekItem;
      })
      .filter(Boolean) as AfishaWeekItem[];

    return {
      title: String(parsed.title || DEFAULT_AFISHA_WEEK.title).slice(0, 120),
      subtitle: String(parsed.subtitle || DEFAULT_AFISHA_WEEK.subtitle).slice(0, 240),
      period: String(parsed.period || DEFAULT_AFISHA_WEEK.period).slice(0, 80),
      vkLink: String(parsed.vkLink || DEFAULT_AFISHA_WEEK.vkLink).slice(0, 500),
      contactNote: healContactNote(parsed.contactNote),
      rulesLink: String(parsed.rulesLink || DEFAULT_AFISHA_WEEK.rulesLink).slice(0, 500),
      coverImage: parsed.coverImage
        ? String(parsed.coverImage).slice(0, 500)
        : DEFAULT_AFISHA_WEEK.coverImage,
      items: items.length ? items : DEFAULT_AFISHA_WEEK.items.map((i) => ({ ...i })),
    };
  } catch {
    return { ...DEFAULT_AFISHA_WEEK, items: DEFAULT_AFISHA_WEEK.items.map((i) => ({ ...i })) };
  }
}

export function serializeAfishaWeek(cfg: AfishaWeekConfig): string {
  return JSON.stringify({
    title: cfg.title,
    subtitle: cfg.subtitle,
    period: cfg.period,
    vkLink: cfg.vkLink,
    contactNote: cfg.contactNote,
    rulesLink: cfg.rulesLink,
    coverImage: cfg.coverImage || null,
    items: cfg.items,
  });
}

/** True when JSON looks like a broken raw VK parse (long «Запись на…» titles). */
export function isBrokenAfishaWeekJson(raw?: string | null): boolean {
  if (!raw?.trim()) return false;
  try {
    const parsed = JSON.parse(raw) as { items?: Array<{ title?: string; action?: string }> };
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    if (!items.length) return true;
    const longZapisi = items.filter((i) => /^запись\s/i.test(String(i.title || ''))).length;
    const noCta = items.filter((i) => i.action === 'text' || !i.action).length;
    return longZapisi >= 2 || noCta >= 2;
  } catch {
    return true;
  }
}

export function afishaItemHref(item: AfishaWeekItem): string | null {
  const v = (item.value || '').trim();
  if (!v) return null;
  if (item.action === 'phone') {
    const digits = v.replace(/[^\d+]/g, '');
    return digits ? `tel:${digits}` : null;
  }
  if (item.action === 'telegram') {
    if (v.startsWith('http')) return v;
    if (v.startsWith('@')) return `https://t.me/${v.slice(1)}`;
    if (v.startsWith('t.me/')) return `https://${v}`;
    return `https://t.me/${v.replace(/^\/+/, '')}`;
  }
  if (item.action === 'link') {
    if (/^https?:\/\//i.test(v)) return v;
    return null;
  }
  return null;
}
