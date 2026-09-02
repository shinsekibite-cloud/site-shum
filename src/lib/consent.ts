import { createHash } from 'crypto';
import {
  COOKIES_POLICY_VERSION,
  PRIVACY_POLICY_VERSION,
  RULES_POLICY_VERSION,
} from '@/lib/consent-versions';

export {
  COOKIES_POLICY_VERSION,
  PRIVACY_POLICY_VERSION,
  RULES_POLICY_VERSION,
} from '@/lib/consent-versions';

/** Stable digital signature for consent records */
export function buildConsentSignature(opts: {
  userId?: string | null;
  email?: string | null;
  kind: 'privacy' | 'cookies' | 'rules';
  version: string;
  at?: Date;
}) {
  const at = (opts.at || new Date()).toISOString();
  const payload = [
    opts.kind,
    opts.version,
    opts.userId || 'guest',
    (opts.email || '').toLowerCase(),
    at,
  ].join('|');
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 32);
  return `yp.${opts.kind}.${opts.version}.${hash}`;
}

export function formatConsentDate(value?: string | Date | null) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
