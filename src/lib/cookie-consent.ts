/** Client cookie consent storage (152-FZ opt-in for analytics / preferences). */

export const COOKIE_CONSENT_STORAGE_KEY = 'yp_cookie_consent_v3';
/** Previous banner storage — migrates analytics flag once */
export const COOKIE_CONSENT_LEGACY_V2_KEY = 'yp_cookie_consent_v2';
/** Legacy guest flag from older banner */
export const COOKIE_CONSENT_LEGACY_KEY = 'yp_cookies_ok_v1';

export const COOKIE_CONSENT_EVENT = 'yp-cookie-consent';
/** Fired by ConsentBanner when its fixed dialog mounts/unmounts (detail.visible). */
export const COOKIE_BANNER_VISIBILITY_EVENT = 'yp-cookie-banner-visibility';
/** Ask ConsentBanner to reopen settings (footer / privacy links). */
export const COOKIE_SETTINGS_OPEN_EVENT = 'yp-cookie-settings-open';

export type CookieConsentState = {
  necessary: true;
  analytics: boolean;
  /** Remember non-essential UI prefs (theme accents, game mute, etc.) */
  preferences: boolean;
  at: string;
  version: string;
};

export type CookieConsentChoice = {
  analytics: boolean;
  preferences: boolean;
};

function parseState(raw: unknown): CookieConsentState | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Partial<CookieConsentState>;
  if (parsed.necessary !== true || typeof parsed.analytics !== 'boolean') return null;
  return {
    necessary: true,
    analytics: parsed.analytics,
    preferences: typeof parsed.preferences === 'boolean' ? parsed.preferences : false,
    at: typeof parsed.at === 'string' ? parsed.at : new Date().toISOString(),
    version: typeof parsed.version === 'string' ? parsed.version : '',
  };
}

export function readCookieConsent(): CookieConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (raw) {
      const parsed = parseState(JSON.parse(raw));
      if (parsed) return parsed;
    }
    // Migrate v2 → v3 (keep analytics; preferences off until user confirms)
    const v2 = localStorage.getItem(COOKIE_CONSENT_LEGACY_V2_KEY);
    if (v2) {
      const legacy = parseState(JSON.parse(v2));
      if (legacy) {
        return {
          ...legacy,
          preferences: false,
        };
      }
    }
    // Migrate legacy "Понятно" as necessary-only (do not auto-enable analytics)
    if (localStorage.getItem(COOKIE_CONSENT_LEGACY_KEY)) {
      return null; // force re-prompt once for analytics choice
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeCookieConsent(
  choice: CookieConsentChoice | boolean,
  version: string
): CookieConsentState {
  const analytics = typeof choice === 'boolean' ? choice : Boolean(choice.analytics);
  const preferences = typeof choice === 'boolean' ? choice : Boolean(choice.preferences);
  const state: CookieConsentState = {
    necessary: true,
    analytics,
    preferences,
    at: new Date().toISOString(),
    version,
  };
  try {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(COOKIE_CONSENT_LEGACY_V2_KEY, JSON.stringify(state));
    localStorage.setItem(COOKIE_CONSENT_LEGACY_KEY, state.at);
    // Mirror for CSS / early scripts (non-HttpOnly, SameSite=Lax)
    document.cookie = `yp_consent=${encodeURIComponent(
      JSON.stringify({ a: analytics ? 1 : 0, p: preferences ? 1 : 0, v: version })
    )};path=/;max-age=${60 * 60 * 24 * 400};SameSite=Lax`;
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(COOKIE_CONSENT_EVENT, {
        detail: { analytics, preferences, version, at: state.at },
      })
    );
  }
  return state;
}

export function hasAnsweredCookieBanner(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)) return true;
    // v2 counts as answered until policy version bump forces re-prompt via banner logic
    return Boolean(localStorage.getItem(COOKIE_CONSENT_LEGACY_V2_KEY));
  } catch {
    return false;
  }
}

export function openCookieSettings() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COOKIE_SETTINGS_OPEN_EVENT));
}

export function hasPreferencesConsent(): boolean {
  return Boolean(readCookieConsent()?.preferences);
}
