/** VK news sync schedule (Europe/Moscow). Stored as JSON on SiteSettings.vkSyncScheduleJson */

export type VkSyncSchedule = {
  /** Hours 0–23 Moscow time, e.g. [12, 18] */
  hours: number[];
  /**
   * Cron-style weekdays: 0=Sun … 6=Sat, or ranges like "1-5".
   * Default Mon–Fri.
   */
  weekdays: string;
};

export const DEFAULT_VK_SYNC_SCHEDULE: VkSyncSchedule = {
  hours: [12, 18],
  weekdays: '1-5',
};

export function parseVkSyncSchedule(raw: string | null | undefined): VkSyncSchedule {
  if (!raw || !String(raw).trim()) return { ...DEFAULT_VK_SYNC_SCHEDULE };
  try {
    const parsed = JSON.parse(raw) as Partial<VkSyncSchedule>;
    const hours = Array.isArray(parsed.hours)
      ? parsed.hours
          .map((h) => Number(h))
          .filter((h) => Number.isFinite(h) && h >= 0 && h <= 23)
          .map((h) => Math.floor(h))
      : DEFAULT_VK_SYNC_SCHEDULE.hours;
    const weekdays =
      typeof parsed.weekdays === 'string' && parsed.weekdays.trim()
        ? parsed.weekdays.trim()
        : DEFAULT_VK_SYNC_SCHEDULE.weekdays;
    return {
      hours: hours.length ? [...new Set(hours)].sort((a, b) => a - b) : [...DEFAULT_VK_SYNC_SCHEDULE.hours],
      weekdays,
    };
  } catch {
    return { ...DEFAULT_VK_SYNC_SCHEDULE };
  }
}

export function serializeVkSyncSchedule(schedule: VkSyncSchedule): string {
  return JSON.stringify({
    hours: schedule.hours,
    weekdays: schedule.weekdays,
  });
}

/** Expand "1-5,0" → Set of weekday numbers */
export function expandWeekdays(expr: string): Set<number> {
  const out = new Set<number>();
  for (const part of String(expr || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const range = part.match(/^(\d)\s*-\s*(\d)$/);
    if (range) {
      let a = Number(range[1]);
      let b = Number(range[2]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a > b) [a, b] = [b, a];
      for (let d = a; d <= b; d++) {
        if (d >= 0 && d <= 6) out.add(d);
      }
      continue;
    }
    const n = Number(part);
    if (Number.isFinite(n) && n >= 0 && n <= 6) out.add(Math.floor(n));
  }
  return out;
}

export function moscowNowParts(date = new Date()): { hour: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const wd = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour: hour === 24 ? 0 : hour, weekday: map[wd] ?? 1 };
}

/** Whether the hourly cron should actually run sync right now. */
export function shouldRunVkSyncNow(
  schedule: VkSyncSchedule,
  date = new Date()
): boolean {
  const { hour, weekday } = moscowNowParts(date);
  const days = expandWeekdays(schedule.weekdays);
  if (!days.has(weekday)) return false;
  return schedule.hours.includes(hour);
}

export function describeVkSyncSchedule(schedule: VkSyncSchedule): string {
  const hours = schedule.hours.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ');
  const days = expandWeekdays(schedule.weekdays);
  const names = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const dayLabel =
    schedule.weekdays.trim() === '1-5'
      ? 'пн–пт'
      : schedule.weekdays.trim() === '0-6' || schedule.weekdays.trim() === '1-7'
        ? 'ежедневно'
        : [...days]
            .sort((a, b) => a - b)
            .map((d) => names[d])
            .join(', ');
  return `${dayLabel}, ${hours} (МСК)`;
}

export const WEEKDAY_PRESETS: { id: string; label: string; value: string }[] = [
  { id: 'weekdays', label: 'Пн–Пт', value: '1-5' },
  { id: 'daily', label: 'Ежедневно', value: '0-6' },
  { id: 'sat-sun', label: 'Сб–Вс', value: '6,0' },
];

export const HOUR_PRESETS = [9, 10, 12, 15, 18, 20, 21];
