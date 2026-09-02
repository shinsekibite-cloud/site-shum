'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Download, Smartphone } from 'lucide-react';
import OnboardingSheet from '@/components/OnboardingSheet';
import {
  COOKIE_BANNER_VISIBILITY_EVENT,
  COOKIE_CONSENT_EVENT,
  hasAnsweredCookieBanner,
} from '@/lib/cookie-consent';

export const PWA_BANNER_VISIBILITY_EVENT = 'yp-pwa-banner-visibility';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type YpPwaGlobal = { deferred: BeforeInstallPromptEvent | null };

declare global {
  interface Window {
    __ypPwa?: YpPwaGlobal;
  }
}

const DISMISS_SESSION = 'yp-pwa-install-dismissed-session';
const DISMISS_FOREVER = 'yp-pwa-install-never';
const DISMISS_USER_PREFIX = 'yp-pwa-install-never-user:';

function readDeferred(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') return null;
  return window.__ypPwa?.deferred || null;
}

function emitPwaVisibility(visible: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PWA_BANNER_VISIBILITY_EVENT, { detail: { visible } }));
}

export default function PwaInstallBanner({ siteName = 'Молодёжь Сочи' }: { siteName?: string }) {
  const { data: session, status } = useSession();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const userId = session?.user?.id || session?.user?.email || '';

  useEffect(() => {
    emitPwaVisibility(visible);
    return () => emitPwaVisibility(false);
  }, [visible]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const forever =
      localStorage.getItem(DISMISS_FOREVER) === '1' ||
      (userId && localStorage.getItem(DISMISS_USER_PREFIX + userId) === '1');
    let sessionDismissed = sessionStorage.getItem(DISMISS_SESSION) === '1';
    try {
      // After a silent service-worker reload, do not pop the install sheet again.
      if (sessionStorage.getItem('yp-sw-just-updated') === '1') {
        sessionStorage.removeItem('yp-sw-just-updated');
        sessionStorage.setItem(DISMISS_SESSION, '1');
        sessionDismissed = true;
      }
    } catch {
      /* ignore */
    }

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS Safari
      Boolean(window.navigator.standalone);
    setStandalone(isStandalone);
    setReady(true);

    if (forever || isStandalone) {
      setVisible(false);
      return;
    }

    const ua = window.navigator.userAgent || '';
    const ios =
      /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIos(ios);

    let t: number | undefined;
    let cancelled = false;
    let cookieBannerOpen = Boolean(document.querySelector('.yp-cookie-banner'));
    let pendingReveal = false;

    const onBip = () => {
      const ev = readDeferred();
      if (ev) setDeferred(ev);
    };
    const onInstalled = () => {
      setDeferred(null);
      setVisible(false);
      sessionStorage.setItem(DISMISS_SESSION, '1');
    };

    const canShowPwa = () =>
      !cancelled &&
      !sessionDismissed &&
      !cookieBannerOpen &&
      !document.querySelector('.yp-cookie-banner') &&
      hasAnsweredCookieBanner();

    const revealPwa = () => {
      if (!canShowPwa()) {
        pendingReveal = true;
        return;
      }
      pendingReveal = false;
      const existing = readDeferred();
      if (existing) setDeferred(existing);
      setVisible(true);
    };

    const scheduleReveal = () => {
      if (t) window.clearTimeout(t);
      if (sessionDismissed) return;
      // After cookie — wait so the homepage hero is not stacked with prompts.
      // Guests get a longer delay; logged-in users slightly shorter.
      const delay = userId ? 8_000 : 20_000;
      t = window.setTimeout(revealPwa, delay);
    };

    const onCookieConsent = () => scheduleReveal();
    const onCookieBannerVisibility = (e: Event) => {
      const detail = (e as CustomEvent<{ visible?: boolean }>).detail;
      cookieBannerOpen = Boolean(detail?.visible);
      if (cookieBannerOpen) {
        setVisible(false);
        return;
      }
      if (pendingReveal || hasAnsweredCookieBanner()) scheduleReveal();
    };

    window.addEventListener('yp-beforeinstallprompt', onBip);
    window.addEventListener('yp-appinstalled', onInstalled);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener(COOKIE_CONSENT_EVENT, onCookieConsent);
    window.addEventListener(COOKIE_BANNER_VISIBILITY_EVENT, onCookieBannerVisibility);

    const existing = readDeferred();
    if (existing) setDeferred(existing);

    if (hasAnsweredCookieBanner() && !cookieBannerOpen) scheduleReveal();
    else pendingReveal = true;

    return () => {
      cancelled = true;
      if (t) window.clearTimeout(t);
      window.removeEventListener('yp-beforeinstallprompt', onBip);
      window.removeEventListener('yp-appinstalled', onInstalled);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener(COOKIE_CONSENT_EVENT, onCookieConsent);
      window.removeEventListener(COOKIE_BANNER_VISIBILITY_EVENT, onCookieBannerVisibility);
    };
  }, [userId]);

  if (!ready || standalone || !visible || status === 'loading') return null;

  const dismissLater = () => {
    sessionStorage.setItem(DISMISS_SESSION, '1');
    setVisible(false);
  };

  const dismissForever = () => {
    localStorage.setItem(DISMISS_FOREVER, '1');
    if (userId) localStorage.setItem(DISMISS_USER_PREFIX + userId, '1');
    sessionStorage.setItem(DISMISS_SESSION, '1');
    setVisible(false);
  };

  const addToHome = async () => {
    if (busy) return;
    const promptEvent = deferred || readDeferred();
    if (isIos) {
      dismissLater();
      window.alert('На iPhone: Поделиться → «На экран Домой»');
      return;
    }
    if (!promptEvent?.prompt) {
      setBusy(true);
      await new Promise((r) => setTimeout(r, 500));
      const retry = readDeferred();
      setBusy(false);
      if (!retry?.prompt) {
        window.alert(`Меню браузера (⋮) → «Установить ${siteName}»`);
        return;
      }
      setDeferred(retry);
      return addToHomeWith(retry);
    }
    return addToHomeWith(promptEvent);
  };

  const addToHomeWith = async (promptEvent: BeforeInstallPromptEvent) => {
    setBusy(true);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (window.__ypPwa) window.__ypPwa.deferred = null;
      setDeferred(null);
      if (choice.outcome === 'accepted') {
        sessionStorage.setItem(DISMISS_SESSION, '1');
        window.setTimeout(() => setVisible(false), 800);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingSheet
      className="yp-pwa-sheet"
      ariaLabel="Установить приложение"
      zIndex={10050}
      icon={<Smartphone size={18} color="#5eead4" />}
      title="Добавить приложение"
      actions={
        <>
          <button
            type="button"
            disabled={busy}
            className="yp-onboard-btn yp-onboard-btn--primary"
            onClick={() => void addToHome()}
          >
            <Download size={14} /> {busy ? '…' : 'Добавить'}
          </button>
          <button type="button" className="yp-onboard-btn yp-onboard-btn--ghost" onClick={dismissLater}>
            Не сейчас
          </button>
          <button type="button" className="yp-onboard-btn yp-onboard-btn--link" onClick={dismissForever}>
            Больше не показывать
          </button>
        </>
      }
    >
      <p>
        Ярлык «{siteName}» на домашнем экране — быстрый вход как в приложении.
      </p>
    </OnboardingSheet>
  );
}
