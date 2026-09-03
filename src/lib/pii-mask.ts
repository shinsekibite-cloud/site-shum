/** Mask PII for UI display (never log full values). */

export function maskEmail(email: string | null | undefined): string {
  const s = String(email || '').trim();
  if (!s || !s.includes('@')) return s || '—';
  const [user, domain] = s.split('@');
  if (!domain) return '—';
  const u =
    user.length <= 2 ? `${user[0] || '*'}*` : `${user.slice(0, 2)}•••${user.slice(-1)}`;
  const parts = domain.split('.');
  const d0 = parts[0] || '';
  const rest = parts.slice(1).join('.') || '***';
  const dMasked = d0.length <= 2 ? `${d0[0] || '*'}*` : `${d0.slice(0, 1)}•••`;
  return `${u}@${dMasked}.${rest}`;
}

export function maskPhone(phone: string | null | undefined): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return phone ? '•••' : '—';
  const last = digits.slice(-4);
  const prefix = digits.length >= 11 && digits.startsWith('7') ? '+7' : '';
  return `${prefix} (•••) •••-${last.slice(0, 2)}-${last.slice(2)}`;
}
