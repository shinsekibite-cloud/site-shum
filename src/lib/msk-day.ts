/** Calendar day helpers in Europe/Moscow. */

export function startOfMskDay(d = new Date()): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const ymd = fmt.format(d); // YYYY-MM-DD
  // MSK = UTC+3 fixed
  return new Date(`${ymd}T00:00:00+03:00`);
}

export function mskDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
