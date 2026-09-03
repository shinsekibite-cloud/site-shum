export type StatsPeriod = 'day' | 'week' | 'month' | 'year' | 'all' | 'custom';

export type StatsRange = {
  period: StatsPeriod;
  from?: string;
  to?: string;
};

export const STATS_PERIODS: { id: StatsPeriod; label: string; short: string }[] = [
  { id: 'day', label: 'За день', short: 'День' },
  { id: 'week', label: 'За неделю', short: 'Неделя' },
  { id: 'month', label: 'За месяц', short: 'Месяц' },
  { id: 'year', label: 'За год', short: 'Год' },
  { id: 'all', label: 'Всё время', short: 'Всё' },
  { id: 'custom', label: 'Свой диапазон', short: 'Диапазон' },
];

export function parseStatsPeriod(raw: string | null | undefined): StatsPeriod {
  const v = (raw || '').toLowerCase();
  if (v === 'day' || v === 'week' || v === 'month' || v === 'year' || v === 'all' || v === 'custom') return v;
  return 'week';
}

export function parseStatsRange(searchParams: URLSearchParams): StatsRange {
  const period = parseStatsPeriod(searchParams.get('period'));
  const from = (searchParams.get('from') || '').trim();
  const to = (searchParams.get('to') || '').trim();
  if (period === 'custom' && from && to) {
    return { period: 'custom', from, to };
  }
  if (period === 'custom') {
    return { period: 'week' };
  }
  return { period };
}

export function statsRangeLabel(range: StatsRange): string {
  if (range.period === 'custom' && range.from && range.to) {
    const f = formatRuDate(range.from);
    const t = formatRuDate(range.to);
    return `${f} — ${t}`;
  }
  return STATS_PERIODS.find((p) => p.id === range.period)?.label || 'За неделю';
}

/** @deprecated use statsRangeLabel */
export function statsPeriodLabel(period: StatsPeriod): string {
  return statsRangeLabel({ period });
}

function formatRuDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function parseIsoDate(raw: string): Date | null {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Inclusive start for filtering, or null for «all». */
export function rangeStartDate(range: StatsRange, now = new Date()): Date | null {
  if (range.period === 'custom' && range.from) {
    return parseIsoDate(range.from);
  }
  return periodStartDate(range.period, now);
}

/** Inclusive end (end of day) for custom range, or null = now/open. */
export function rangeEndDate(range: StatsRange, now = new Date()): Date | null {
  if (range.period === 'custom' && range.to) {
    const d = parseIsoDate(range.to);
    if (!d) return null;
    d.setHours(23, 59, 59, 999);
    return d;
  }
  return null;
}

/** Inclusive start (UTC ms) for period, or null for «all». */
export function periodStartDate(period: StatsPeriod, now = new Date()): Date | null {
  if (period === 'all' || period === 'custom') return period === 'all' ? null : null;
  const d = new Date(now);
  if (period === 'day') {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === 'week') {
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === 'month') {
    d.setDate(d.getDate() - 29);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  d.setFullYear(d.getFullYear() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function periodDayBuckets(period: StatsPeriod): number {
  if (period === 'day') return 1;
  if (period === 'week') return 7;
  if (period === 'month') return 30;
  if (period === 'year') return 12;
  return 12;
}

export function periodUsesMonths(period: StatsPeriod, range?: StatsRange): boolean {
  if (period === 'custom' && range?.from && range?.to) {
    const start = parseIsoDate(range.from);
    const end = parseIsoDate(range.to);
    if (start && end) {
      const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
      return days > 62;
    }
  }
  return period === 'year' || period === 'all';
}

export function buildDateFilter(range: StatsRange, field: 'createdAt' | 'startTime' = 'createdAt') {
  const since = rangeStartDate(range);
  const until = rangeEndDate(range);
  if (!since && !until) return undefined;
  const filter: { gte?: Date; lte?: Date } = {};
  if (since) filter.gte = since;
  if (until) filter.lte = until;
  return { [field]: filter };
}

export function statsRangeQuery(range: StatsRange): string {
  const params = new URLSearchParams();
  params.set('period', range.period);
  if (range.period === 'custom' && range.from && range.to) {
    params.set('from', range.from);
    params.set('to', range.to);
  }
  return params.toString();
}
