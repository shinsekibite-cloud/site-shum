/** Coerce Prisma/JSON dates (Date | string | number) for display. */
export function asDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatRuDate(
  value: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = asDate(value);
  if (!d) return '';
  return d.toLocaleDateString('ru-RU', options);
}
