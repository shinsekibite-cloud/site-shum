'use client';

import { useEffect } from 'react';
import { COOKIE_CONSENT_EVENT, readCookieConsent } from '@/lib/cookie-consent';

type YmFn = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };

declare global {
  interface Window {
    ym?: YmFn;
    __ypMetrikaId?: number;
    __ypMetrikaLoaded?: boolean;
  }
}

export function reachGoal(name: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.ym || !window.__ypMetrikaId) return;
  try {
    window.ym(window.__ypMetrikaId, 'reachGoal', name, params);
  } catch {
    /* ignore */
  }
}

function initMetrika(id: string) {
  if (typeof window === 'undefined') return;
  if (window.__ypMetrikaLoaded) return;
  if (!/^\d+$/.test(id)) return;

  const num = Number(id);
  window.__ypMetrikaId = num;
  window.__ypMetrikaLoaded = true;

  const w = window as Window & { ym?: YmFn };
  if (typeof w.ym !== 'function') {
    const stub: YmFn = (...args: unknown[]) => {
      (stub.a = stub.a || []).push(args);
    };
    stub.l = Date.now();
    w.ym = stub;
  }

  const src = `https://mc.yandex.ru/metrika/tag.js?id=${id}`;
  if (![...document.scripts].some((s) => s.src === src)) {
    const s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  w.ym?.(num, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: false,
  });
}

type Props = {
  counterId?: string | null;
  /** When true, wait for analytics cookie consent before loading Metrika */
  requireConsent?: boolean;
};

export default function YandexMetrika({ counterId, requireConsent = true }: Props) {
  const id = String(counterId || '').trim();

  useEffect(() => {
    if (!id || !/^\d+$/.test(id)) return;

    const tryLoad = () => {
      if (!requireConsent) {
        initMetrika(id);
        return;
      }
      const consent = readCookieConsent();
      if (consent?.analytics) initMetrika(id);
    };

    tryLoad();

    const onConsent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { analytics?: boolean } | undefined;
      if (detail?.analytics || readCookieConsent()?.analytics) initMetrika(id);
    };
    window.addEventListener(COOKIE_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onConsent);
  }, [id, requireConsent]);

  // No noscript pixel when consent required — would set analytics cookie without opt-in
  if (!id || !/^\d+$/.test(id) || requireConsent) return null;

  return (
    <noscript>
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://mc.yandex.ru/watch/${id}`}
          style={{ position: 'absolute', left: '-9999px' }}
          alt=""
        />
      </div>
    </noscript>
  );
}
