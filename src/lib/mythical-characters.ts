import { hashSeed } from '@/lib/privacy-alias';

/** 100 mythical / fairy-tale character seeds for About team & missing media. */
export const MYTHICAL_CHARACTERS: readonly string[] = [
  'Василиса Премудрая',
  'Иван Царевич',
  'Жар-Птица',
  'Серый Волк',
  'Кощей Бессмертный',
  'Баба-Яга',
  'Финист Ясный Сокол',
  'Снегурочка',
  'Дед Мороз',
  'Алёнушка',
  'Иванушка',
  'Емеля',
  'Царевна-Лягушка',
  'Добрыня Никитич',
  'Илья Муромец',
  'Алёша Попович',
  'Змей Горыныч',
  'Соловей-Разбойник',
  'Кащей Чернокнижник',
  'Марья Моревна',
  'Никита Кожемяка',
  'Садко',
  'Лель',
  'Купава',
  'Снежная Королева',
  'Русалка',
  'Леший',
  'Кикимора',
  'Домовой',
  'Водяной',
  'Полкан',
  'Сивка-Бурка',
  'Конёк-Горбунок',
  'Царь Салтан',
  'Царевна Лебедь',
  'Черномор',
  'Вий',
  'Панночка',
  'Оксана',
  'Ганна',
  'Лихо Одноглазое',
  'Морозко',
  'Настенька',
  'Мачеха',
  'Крошечка-Хаврошечка',
  'Синяя Борода',
  'Пеппи',
  'Алиса',
  'Чеширский Кот',
  'Шляпник',
  'Питер Пэн',
  'Динь-Динь',
  'Капитан Крюк',
  'Мерлин',
  'Артур',
  'Гвиневера',
  'Ланселот',
  'Мордред',
  'Фея Моргана',
  'Один',
  'Тор',
  'Локи',
  'Фрейя',
  'Сигурд',
  'Брюнхильда',
  'Пегас',
  'Единорог',
  'Феникс',
  'Грифон',
  'Дракон Азур',
  'Дракон Рубин',
  'Сфинкс',
  'Минотавр',
  'Медуза',
  'Персей',
  'Афина',
  'Аполлон',
  'Артемида',
  'Гермес',
  'Прометей',
  'Пандора',
  'Орфей',
  'Эвридика',
  'Икар',
  'Дедал',
  'Геракл',
  'Ахиллес',
  'Одиссей',
  'Пенелопа',
  'Цирцея',
  'Калипсо',
  'Тритон',
  'Нептун',
  'Атлант',
  'Гея',
  'Селена',
  'Гелиос',
  'Эос',
  'Ника',
  'Тюхе',
] as const;

export function mythicalCharacterByIndex(i: number) {
  const n = MYTHICAL_CHARACTERS.length;
  return MYTHICAL_CHARACTERS[((i % n) + n) % n];
}

export function mythicalCharacterBySeed(seed: string) {
  return mythicalCharacterByIndex(hashSeed(seed));
}

export function mythicalAvatarUrl(seed: string) {
  const safe = encodeURIComponent(String(seed || 'myth').slice(0, 64));
  return `/api/avatar/myth/${safe}`;
}

/** Soft SVG portrait for a mythical character (deterministic). */
export function mythicalAvatarSvg(seed: string, size = 256): string {
  const h = hashSeed(seed);
  const name = mythicalCharacterBySeed(seed);
  const palettes = [
    ['#0ea5e9', '#0369a1'],
    ['#8b5cf6', '#4c1d95'],
    ['#f59e0b', '#b45309'],
    ['#10b981', '#065f46'],
    ['#ef4444', '#7f1d1d'],
    ['#06b6d4', '#0e7490'],
    ['#ec4899', '#9d174d'],
    ['#6366f1', '#312e81'],
    ['#84cc16', '#3f6212'],
    ['#f97316', '#9a3412'],
  ] as const;
  const [c1, c2] = palettes[h % palettes.length];
  const initial = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  const star = 3 + (h % 5);
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="28" fill="url(#g)"/>
  <circle cx="128" cy="98" r="46" fill="rgba(255,255,255,0.22)"/>
  <circle cx="128" cy="210" r="78" fill="rgba(255,255,255,0.16)"/>
  ${Array.from({ length: star })
    .map((_, i) => {
      const a = ((h + i * 47) % 360) * (Math.PI / 180);
      const r = 70 + ((h >> i) % 40);
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${3 + (i % 3)}" fill="rgba(255,255,255,0.55)"/>`;
    })
    .join('')}
  <text x="128" y="112" text-anchor="middle" font-family="Georgia, serif" font-size="42" font-weight="700" fill="#fff">${escape(initial)}</text>
  <text x="128" y="236" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="rgba(255,255,255,0.9)">${escape(name.slice(0, 22))}</text>
</svg>`;
}
