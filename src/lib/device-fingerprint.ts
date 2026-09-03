/** Stable browser device id for trusted-device checks. */

const STORAGE_KEY = 'yp_device_id_v2';

function stripUaVersions(ua: string) {
  // Chrome/Safari/Firefox build numbers change often — drop them so updates
  // don't look like a brand-new device.
  return ua
    .replace(/(\bChrome\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bCriOS\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bFirefox\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bEdg\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bVersion\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bAppleWebKit\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bSafari\/)\d+[\d.]*/gi, '$1x')
    .replace(/(\bYaBrowser\/)\d+[\d.]*/gi, '$1x')
    .replace(/\b\d{2,} build\/\d+\b/gi, 'build/x');
}

async function sha256Hex(raw: string): Promise<string> {
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  return `x${Math.abs(h).toString(16).padStart(8, '0')}`;
}

/**
 * Soft fingerprint from stable signals only:
 * - no Chrome version bumps
 * - screen size orientation-independent (min×max)
 */
export async function computeStableSoftFingerprint(): Promise<string> {
  try {
    const w = Number(screen?.width) || 0;
    const h = Number(screen?.height) || 0;
    const minSide = Math.min(w, h);
    const maxSide = Math.max(w, h);
    const parts = [
      stripUaVersions(navigator.userAgent || ''),
      navigator.language || '',
      String(minSide),
      String(maxSide),
      String(screen.colorDepth || ''),
      String(new Date().getTimezoneOffset()),
      String(navigator.hardwareConcurrency || ''),
      // deviceMemory is often missing on iOS — always coerce so undefined≠"8" flips don't happen
      String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0),
      String(navigator.maxTouchPoints || 0),
      String((navigator as Navigator & { platform?: string }).platform || ''),
    ];
    return (await sha256Hex(parts.join('|'))).slice(0, 32);
  } catch {
    return 'unknown';
  }
}

function randomDeviceId(): string {
  if (crypto?.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 32);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Primary device id: persisted in localStorage so the same browser install
 * keeps one identity across Chrome updates and screen rotation.
 * Seeded from soft fingerprint on first visit for continuity.
 */
export async function collectDeviceFingerprint(): Promise<string> {
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(STORAGE_KEY)?.trim() || '';
      if (/^[a-f0-9]{32}$/i.test(existing)) {
        return existing.toLowerCase();
      }
    }

    // Prefer soft fingerprint as initial id (survives if storage was briefly unavailable)
    const soft = await computeStableSoftFingerprint();
    const id = soft !== 'unknown' ? soft : randomDeviceId();

    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private mode / blocked storage */
    }
    return id;
  } catch {
    return 'unknown';
  }
}

export async function pingSecurity(kind: 'LOGIN' | 'PING' | 'LOGOUT' = 'PING') {
  try {
    const fingerprint = await collectDeviceFingerprint();
    await fetch('/api/user/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint, kind }),
      keepalive: kind === 'LOGOUT',
    });
  } catch {
    /* ignore */
  }
}
