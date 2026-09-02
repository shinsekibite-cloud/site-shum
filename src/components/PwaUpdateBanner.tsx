'use client';

import { useEffect } from 'react';

/**
 * When a new service worker is waiting, activate it silently.
 * Do NOT flash a banner — auto skipWaiting + soft reload already run,
 * and a visible "update" toast felt like a random popup with extra chrome.
 */
export default function PwaUpdateBanner() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const activate = (sw: ServiceWorker) => {
      try {
        sw.postMessage({ type: 'SKIP_WAITING' });
        sw.postMessage('SKIP_WAITING');
      } catch {
        /* ignore */
      }
    };

    const onUpdateFound = (reg: ServiceWorkerRegistration) => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          activate(reg.waiting || sw);
        }
      });
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      if (reg.waiting) activate(reg.waiting);
      reg.addEventListener('updatefound', () => onUpdateFound(reg));
      void reg.update();
    });

    const onControllerChange = () => {
      const path = window.location.pathname || '';
      // Never hard-reload mid-game / cabinet — that felt like a freeze on shop tap.
      if (
        path.startsWith('/games') ||
        path.startsWith('/presentation') ||
        path.startsWith('/dashboard') ||
        path.startsWith('/admin')
      ) {
        return;
      }
      try {
        // Suppress install/onboarding sheets that would pop up right after this reload.
        sessionStorage.setItem('yp-sw-just-updated', '1');
        sessionStorage.setItem('yp-pwa-install-dismissed-session', '1');
      } catch {
        /* ignore */
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return null;
}
