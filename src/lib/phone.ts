/** Normalize RU phone to digits with leading 7 where possible. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  // drop leading 00 international prefix
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  }
  if (digits.length === 10) {
    digits = '7' + digits;
  }
  // +7 / 7 already 11 digits
  return digits;
}

/** Last 10 digits (national RU number) — best key for matching 8… / 7… / +7… */
export function phoneNational10(raw: string | null | undefined): string {
  const d = normalizePhone(raw);
  if (d.length >= 10) return d.slice(-10);
  return d;
}

/** True if the login string looks like a phone, not an email */
export function isPhoneLikeLogin(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = String(raw).trim();
  if (s.includes('@')) return false;
  const digits = s.replace(/\D/g, '');
  // 10–11 digit RU numbers, optionally with + / spaces / dashes
  return digits.length >= 10 && digits.length <= 11;
}

export function formatPhoneDisplay(raw: string | null | undefined): string {
  const d = normalizePhone(raw);
  if (d.length === 11 && d.startsWith('7')) {
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return raw || '';
}

/** Progressive mask while typing: +7 (XXX) XXX-XX-XX */
export function formatPhoneMaskInput(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7') && d.length) d = '7' + d;
  d = d.slice(0, 11);
  if (!d.length) return '';
  let out = '+7';
  if (d.length > 1) out += ' (' + d.slice(1, 4);
  if (d.length >= 4) out += ')';
  if (d.length > 4) out += ' ' + d.slice(4, 7);
  if (d.length > 7) out += '-' + d.slice(7, 9);
  if (d.length > 9) out += '-' + d.slice(9, 11);
  return out;
}

/** Canonical storage form: +79281234567 */
export function toStoredPhone(raw: string | null | undefined): string | null {
  const d = normalizePhone(raw);
  if (d.length < 11) return null;
  return `+${d}`;
}
