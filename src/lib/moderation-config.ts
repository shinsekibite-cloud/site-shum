export type ModerationConfig = {
  /** Soft-mask DMs and create ContentFlag rows */
  enabled: boolean;
  /** Max message length (chars) */
  maxMessageLength: number;
  rateLimits: {
    perMinute: number;
    perHour: number;
  };
  /** After this many warns, auto-block the account (0 = disabled) */
  autoBlockWarnThreshold: number;
  /** Notify user when staff marks ACTIONED */
  notifyOnActioned: boolean;
  /** Notify user when staff dismisses a false positive */
  notifyOnDismissed: boolean;
  /** Minimum gap between messages from same user (ms); 0 = off */
  minMessageIntervalMs: number;
};

export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  enabled: true,
  maxMessageLength: 2000,
  rateLimits: {
    perMinute: 20,
    perHour: 120,
  },
  autoBlockWarnThreshold: 5,
  notifyOnActioned: true,
  notifyOnDismissed: true,
  minMessageIntervalMs: 800,
};

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export function parseModerationConfig(raw: string | null | undefined): ModerationConfig {
  const d = DEFAULT_MODERATION_CONFIG;
  if (!raw?.trim()) return { ...d, rateLimits: { ...d.rateLimits } };
  try {
    const j = JSON.parse(raw) as Partial<ModerationConfig>;
    return {
      enabled: j.enabled !== false,
      maxMessageLength: clampInt(j.maxMessageLength, 200, 8000, d.maxMessageLength),
      rateLimits: {
        perMinute: clampInt(j.rateLimits?.perMinute, 3, 120, d.rateLimits.perMinute),
        perHour: clampInt(j.rateLimits?.perHour, 10, 2000, d.rateLimits.perHour),
      },
      autoBlockWarnThreshold: clampInt(
        j.autoBlockWarnThreshold,
        0,
        50,
        d.autoBlockWarnThreshold
      ),
      notifyOnActioned: j.notifyOnActioned !== false,
      notifyOnDismissed: j.notifyOnDismissed !== false,
      minMessageIntervalMs: clampInt(j.minMessageIntervalMs, 0, 10000, d.minMessageIntervalMs),
    };
  } catch {
    return { ...d, rateLimits: { ...d.rateLimits } };
  }
}

export function serializeModerationConfig(cfg: ModerationConfig): string {
  return JSON.stringify(cfg);
}

/** Build a clear user-facing decision body (never just a bare moderator note). */
export function buildModerationDecisionBody(opts: {
  action: 'ACTIONED' | 'DISMISSED';
  categoryLabel: string;
  snippet: string;
  note?: string | null;
}) {
  const snip = (opts.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const quote = snip ? `«${snip}»` : 'ваше сообщение';
  if (opts.action === 'DISMISSED') {
    const base = `Модерация сняла замечание по сообщению (${opts.categoryLabel}): ${quote}.`;
    return opts.note?.trim() ? `${base} Комментарий: ${opts.note.trim().slice(0, 280)}` : base;
  }
  const base = `Решение по сообщению (${opts.categoryLabel}): ${quote}.`;
  if (opts.note?.trim()) {
    return `${base} Ответ модератора: ${opts.note.trim().slice(0, 280)}. Соблюдайте правила сервиса.`;
  }
  return `${base} Соблюдайте правила общения на портале. Повторные нарушения могут привести к блокировке.`;
}

export const MODERATION_NOTE_PRESETS = [
  'Повторное нарушение. Соблюдайте уважительный тон в переписке.',
  'Сообщение нарушает правила сервиса. При повторе возможна блокировка.',
  'Это официальное предупреждение. Не используйте запрещённый контент.',
  'Ложное срабатывание снято — извините за беспокойство.',
] as const;
