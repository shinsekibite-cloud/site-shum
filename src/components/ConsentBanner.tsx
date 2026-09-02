'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Cookie, Settings2, ShieldCheck } from 'lucide-react';
import OnboardingSheet from '@/components/OnboardingSheet';
import {
  COOKIE_BANNER_VISIBILITY_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_SETTINGS_OPEN_EVENT,
  hasAnsweredCookieBanner,
  readCookieConsent,
  writeCookieConsent,
  type CookieConsentChoice,
} from '@/lib/cookie-consent';
import { COOKIES_POLICY_VERSION } from '@/lib/consent-versions';

type Props = { enabled?: boolean };

function emitBannerVisibility(visible: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(COOKIE_BANNER_VISIBILITY_EVENT, { detail: { visible } })
  );
}

export default function ConsentBanner({ enabled = true }: Props) {
  const { data: session, status } = useSession();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needProfileSign, setNeedProfileSign] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(false);
  const [preferencesOn, setPreferencesOn] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      const cur = readCookieConsent();
      setAnalyticsOn(Boolean(cur?.analytics));
      setPreferencesOn(Boolean(cur?.preferences));
      setCustomize(true);
      setForceOpen(true);
      setVisible(true);
    };
    window.addEventListener(COOKIE_SETTINGS_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COOKIE_SETTINGS_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    if (forceOpen) {
      setVisible(true);
      return;
    }
    if (status === 'loading') return;

    if (session?.user) {
      fetch('/api/user/consent')
        .then(async (r) => {
          const raw = await r.text();
          try {
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        })
        .then((data) => {
          if (!data) {
            setNeedProfileSign(false);
            const local = readCookieConsent();
            setVisible(!hasAnsweredCookieBanner() || local?.version !== COOKIES_POLICY_VERSION);
            return;
          }
          const needCookies =
            !data?.cookiesAcceptedAt || data?.cookiesPolicyVersion !== COOKIES_POLICY_VERSION;
          const needPrivacy = Boolean(data?.needsPrivacyReconsent);
          setNeedProfileSign(Boolean(needCookies || needPrivacy));
          const answered = hasAnsweredCookieBanner();
          const local = readCookieConsent();
          const versionGap = answered && local?.version !== COOKIES_POLICY_VERSION;
          setVisible(needCookies || !answered || Boolean(versionGap));
        })
        .catch(() => {
          setNeedProfileSign(false);
          const local = readCookieConsent();
          setVisible(!hasAnsweredCookieBanner() || local?.version !== COOKIES_POLICY_VERSION);
        });
      return;
    }

    setNeedProfileSign(false);
    const local = readCookieConsent();
    setVisible(!hasAnsweredCookieBanner() || local?.version !== COOKIES_POLICY_VERSION);
  }, [session, status, enabled, forceOpen]);

  useEffect(() => {
    emitBannerVisibility(Boolean(enabled && visible));
    return () => emitBannerVisibility(false);
  }, [enabled, visible]);

  const persistChoice = async (choice: CookieConsentChoice) => {
    writeCookieConsent(choice, COOKIES_POLICY_VERSION);
    if (session?.user && needProfileSign) {
      setBusy(true);
      try {
        await fetch('/api/user/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cookies: true,
            privacy: true,
            analytics: choice.analytics,
          }),
        });
      } finally {
        setBusy(false);
      }
    }
    setForceOpen(false);
    setCustomize(false);
    setVisible(false);
  };

  if (!enabled || !visible) return null;

  const loggedIn = Boolean(session?.user);
  const icon = customize ? (
    <Settings2 size={18} color="#5eead4" />
  ) : loggedIn && needProfileSign ? (
    <ShieldCheck size={18} color="#5eead4" />
  ) : (
    <Cookie size={18} color="#5eead4" />
  );

  const dismissSettings = () => {
    if (!forceOpen) return;
    if (hasAnsweredCookieBanner()) {
      const local = readCookieConsent();
      if (local?.version === COOKIES_POLICY_VERSION) {
        setForceOpen(false);
        setCustomize(false);
        setVisible(false);
      }
    }
  };

  return (
    <OnboardingSheet
      className="yp-cookie-banner"
      ariaLabel="Согласие на использование cookies"
      zIndex={10060}
      icon={icon}
      title={customize ? 'Настройки cookie' : 'Cookie и данные'}
      onDismiss={forceOpen ? dismissSettings : undefined}
      actions={
        customize ? (
          <>
            <button
              type="button"
              disabled={busy}
              className="yp-onboard-btn yp-onboard-btn--primary"
              onClick={() => persistChoice({ analytics: analyticsOn, preferences: preferencesOn })}
            >
              {busy ? '…' : 'Сохранить'}
            </button>
            <button
              type="button"
              disabled={busy}
              className="yp-onboard-btn yp-onboard-btn--ghost"
              onClick={() => {
                setCustomize(false);
                if (forceOpen && hasAnsweredCookieBanner()) {
                  const local = readCookieConsent();
                  if (local?.version === COOKIES_POLICY_VERSION) {
                    setForceOpen(false);
                    setVisible(false);
                  }
                }
              }}
            >
              Назад
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              className="yp-onboard-btn yp-onboard-btn--primary"
              onClick={() => persistChoice({ analytics: true, preferences: true })}
            >
              {busy ? '…' : 'Принять'}
            </button>
            <button
              type="button"
              disabled={busy}
              className="yp-onboard-btn yp-onboard-btn--ghost"
              onClick={() => persistChoice({ analytics: false, preferences: false })}
            >
              Только нужные
            </button>
            <button
              type="button"
              disabled={busy}
              className="yp-onboard-btn yp-onboard-btn--link"
              onClick={() => {
                const cur = readCookieConsent();
                setAnalyticsOn(Boolean(cur?.analytics));
                setPreferencesOn(Boolean(cur?.preferences));
                setCustomize(true);
              }}
            >
              Настроить
            </button>
          </>
        )
      }
    >
      {customize ? (
        <div className="yp-onboard-toggles">
          <label>
            <input type="checkbox" checked disabled />
            <span>Необходимые — всегда</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={analyticsOn}
              onChange={(e) => setAnalyticsOn(e.target.checked)}
            />
            <span>Аналитика</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferencesOn}
              onChange={(e) => setPreferencesOn(e.target.checked)}
            />
            <span>Предпочтения</span>
          </label>
        </div>
      ) : (
        <p>
          Нужны для входа и безопасности. Подробнее:{' '}
          <Link href="/privacy">политика</Link>
          {' · '}
          <Link href="/rules">правила</Link>.
          <span className="yp-onboard-meta"> v{COOKIES_POLICY_VERSION}</span>
        </p>
      )}
    </OnboardingSheet>
  );
}

// keep key referenced for docs/tooling
void COOKIE_CONSENT_STORAGE_KEY;
