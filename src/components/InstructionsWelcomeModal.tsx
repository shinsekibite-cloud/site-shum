'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { BookOpen } from 'lucide-react';
import OnboardingSheet from '@/components/OnboardingSheet';
import {
  COOKIE_BANNER_VISIBILITY_EVENT,
  COOKIE_CONSENT_EVENT,
} from '@/lib/cookie-consent';
import { PWA_BANNER_VISIBILITY_EVENT } from '@/components/PwaInstallBanner';

type PromptState = 'unknown' | 'show' | 'hide';

const LS_KEY = 'yp_instructions_prompt_v1';

function readLocal(): 'skipped' | 'dismissed' | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'skipped' || v === 'dismissed') return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writeLocal(v: 'skipped' | 'dismissed') {
  try {
    localStorage.setItem(LS_KEY, v);
  } catch {
    /* ignore */
  }
}

/**
 * After cookie → (optional) app prompt → instructions, with a short delay between sheets.
 */
export default function InstructionsWelcomeModal() {
  const { data: session, status } = useSession();
  const pathname = usePathname() || '';
  const [state, setState] = useState<PromptState>('unknown');
  const [busy, setBusy] = useState(false);
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated' || !session?.user) {
      setEligible(false);
      setState('hide');
      return;
    }
    if (pathname.startsWith('/admin') || pathname.startsWith('/ops')) {
      setEligible(false);
      setState('hide');
      return;
    }
    const local = readLocal();
    if (local === 'dismissed') {
      setEligible(false);
      setState('hide');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user/instructions', { cache: 'no-store' });
        const raw = await res.text();
        let data: any = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = {};
        }
        if (cancelled) return;
        if (data?.completed || data?.promptDismissed) {
          if (data?.promptDismissed) writeLocal('dismissed');
          setEligible(false);
          setState('hide');
          return;
        }
        if (local === 'skipped') {
          try {
            if (sessionStorage.getItem('yp_instr_skip_session') === '1') {
              setEligible(false);
              setState('hide');
              return;
            }
          } catch {
            /* ignore */
          }
        }
        setEligible(true);
      } catch {
        if (!cancelled) {
          setEligible(false);
          setState('hide');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, session?.user, pathname]);

  useEffect(() => {
    if (!eligible) return;

    let cancelled = false;
    let timer: number | undefined;
    let cookieOpen = Boolean(document.querySelector('.yp-cookie-banner'));
    let pwaOpen = Boolean(document.querySelector('.yp-pwa-sheet'));

    const tryReveal = () => {
      if (cancelled) return;
      cookieOpen = Boolean(document.querySelector('.yp-cookie-banner'));
      pwaOpen = Boolean(document.querySelector('.yp-pwa-sheet'));
      // Only wait if another sheet is actually on screen. Cookie banner can be
      // disabled / never answered — that must not block the briefing forever.
      if (cookieOpen || pwaOpen) {
        setState((s) => (s === 'show' ? 'hide' : s === 'unknown' ? 'unknown' : 'hide'));
        return;
      }
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!cancelled && !document.querySelector('.yp-cookie-banner') && !document.querySelector('.yp-pwa-sheet')) {
          setState('show');
        }
      }, 1300);
    };

    const onCookieVis = (e: Event) => {
      cookieOpen = Boolean((e as CustomEvent<{ visible?: boolean }>).detail?.visible);
      tryReveal();
    };
    const onPwaVis = (e: Event) => {
      pwaOpen = Boolean((e as CustomEvent<{ visible?: boolean }>).detail?.visible);
      tryReveal();
    };
    const onConsent = () => tryReveal();

    window.addEventListener(COOKIE_BANNER_VISIBILITY_EVENT, onCookieVis);
    window.addEventListener(PWA_BANNER_VISIBILITY_EVENT, onPwaVis);
    window.addEventListener(COOKIE_CONSENT_EVENT, onConsent);
    tryReveal();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener(COOKIE_BANNER_VISIBILITY_EVENT, onCookieVis);
      window.removeEventListener(PWA_BANNER_VISIBILITY_EVENT, onPwaVis);
      window.removeEventListener(COOKIE_CONSENT_EVENT, onConsent);
    };
  }, [eligible]);

  const persist = useCallback(async (action: 'skip' | 'dismiss') => {
    setBusy(true);
    writeLocal(action === 'dismiss' ? 'dismissed' : 'skipped');
    if (action === 'skip') {
      try {
        sessionStorage.setItem('yp_instr_skip_session', '1');
      } catch {
        /* ignore */
      }
    }
    try {
      await fetch('/api/user/instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action === 'dismiss' ? 'dismiss_prompt' : 'skip_prompt' }),
      });
    } catch {
      /* local already set */
    }
    setBusy(false);
    setState('hide');
  }, []);

  if (state !== 'show') return null;

  return (
    <OnboardingSheet
      className="yp-instr-sheet"
      ariaLabel="Инструктаж портала"
      zIndex={10040}
      icon={<BookOpen size={18} color="#5eead4" />}
      title="Пройти инструктаж?"
      actions={
        <>
          <Link
            href="/dashboard/guides"
            className="yp-onboard-btn yp-onboard-btn--primary"
            onClick={() => {
              writeLocal('skipped');
              try {
                sessionStorage.setItem('yp_instr_skip_session', '1');
              } catch {
                /* ignore */
              }
              setState('hide');
            }}
          >
            Пройти
          </Link>
          <button
            type="button"
            className="yp-onboard-btn yp-onboard-btn--ghost"
            disabled={busy}
            onClick={() => void persist('skip')}
          >
            Не сейчас
          </button>
          <button
            type="button"
            className="yp-onboard-btn yp-onboard-btn--link"
            disabled={busy}
            onClick={() => void persist('dismiss')}
          >
            Больше не показывать
          </button>
        </>
      }
    >
      <p>Коротко: билеты, рейтинги, эко-баллы и безопасность. За прохождение — достижение.</p>
    </OnboardingSheet>
  );
}
