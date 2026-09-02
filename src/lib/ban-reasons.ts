/** Structured ban / warning reasons for moderation. */

export type BanSeverity = 'hard' | 'soft';

export type BanReasonDef = {
  code: string;
  label: string;
  severity: BanSeverity;
  description?: string;
};

export const BAN_REASONS: BanReasonDef[] = [
  // Hard
  {
    code: 'SPAM',
    label: 'Спам / реклама',
    severity: 'hard',
    description: 'Рассылка рекламы, накрутка, коммерческий спам',
  },
  {
    code: 'TOXICITY',
    label: 'Оскорбления / токсичность',
    severity: 'hard',
  },
  {
    code: 'FRAUD',
    label: 'Мошенничество / обман',
    severity: 'hard',
  },
  {
    code: 'MULTI_ACCOUNT',
    label: 'Множественные аккаунты (мульт)',
    severity: 'hard',
  },
  {
    code: 'RULES',
    label: 'Нарушение правил сообщества',
    severity: 'hard',
  },
  {
    code: 'BOT_ACTIVITY',
    label: 'Подозрительная активность (боты, массовые регистрации)',
    severity: 'hard',
  },
  // Soft
  {
    code: 'DISCUSSION_RULES',
    label: 'Нарушение правил обсуждений',
    severity: 'soft',
  },
  {
    code: 'FLOOD',
    label: 'Флуд',
    severity: 'soft',
  },
  {
    code: 'MISCONDUCT',
    label: 'Некорректное поведение',
    severity: 'soft',
  },
  {
    code: 'SUSPECTED_MULTI',
    label: 'Подозрение на мультиаккаунт (проверка)',
    severity: 'soft',
  },
];

export const BAN_REASON_BY_CODE = Object.fromEntries(
  BAN_REASONS.map((r) => [r.code, r])
) as Record<string, BanReasonDef>;

export function formatBanReasons(codes: string[], comment?: string | null): string {
  const labels = codes
    .map((c) => BAN_REASON_BY_CODE[c]?.label || c)
    .filter(Boolean);
  const base = labels.length ? labels.join('; ') : 'Нарушение правил сайта';
  const note = (comment || '').trim();
  return note ? `${base}. ${note}`.slice(0, 500) : base.slice(0, 500);
}

export function parseReasonCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(BAN_REASONS.map((r) => r.code));
  return [...new Set(raw.map(String).filter((c) => allowed.has(c)))];
}
