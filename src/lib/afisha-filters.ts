/** Filters for public afisha — hide QA / demo junk. */

const JUNK_TITLE_RE =
  /\b(qa|test|тест|тестов|dummy|demo|smoke|e2e|проверка\s*портала)\b/i;

export function isJunkEventTitle(title: string | null | undefined) {
  const t = String(title || '').trim();
  if (!t) return true;
  return JUNK_TITLE_RE.test(t);
}

export function publicBookingWhere() {
  return {
    status: 'APPROVED' as const,
    isDemoData: false,
  };
}
