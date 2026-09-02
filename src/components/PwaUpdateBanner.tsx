'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function PwaUpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const activate = (sw: ServiceWorker) => {
      sw.postMessage({ type: 'SKIP_WAITING' });
      sw.postMessage('SKIP_WAITING');
    };

    const onUpdateFound = (reg: ServiceWorkerRegistration) => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          const next = reg.waiting || sw;
          setWaiting(next);
          /* Critical shop/API SW fix — activate without waiting for a tap */
          activate(next);
        }
      });
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      if (reg.waiting) {
        setWaiting(reg.waiting);
        activate(reg.waiting);
      }
      reg.addEventListener('updatefound', () => onUpdateFound(reg));
      void reg.update();
    });

    const onControllerChange = () => {
      // Never hard-reload mid-game / cabinet — that felt like a freeze on shop tap.
      const path = window.location.pathname || '';
      if (
        path.startsWith('/games') ||
        path.startsWith('/presentation') ||
        path.startsWith('/dashboard') ||
        path.startsWith('/admin')
      ) {
        return;
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  if (!waiting) return null;

  return (
    <div className="pwa-update-banner">
      <span>Доступна новая версия приложения</span>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          waiting.postMessage({ type: 'SKIP_WAITING' });
          waiting.postMessage('SKIP_WAITING');
          // fallback reload if SW ignores message
          setTimeout(() => window.location.reload(), 400);
        }}
      >
        <RefreshCw size={16} /> Обновить
      </button>
    </div>
  );
}
