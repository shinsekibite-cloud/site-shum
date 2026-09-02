'use client';

import { useEffect } from 'react';

type TicketLike = {
  ticketCode?: string | null;
  booking?: {
    id?: string;
    title?: string;
    startTime?: string | Date;
  };
};

/**
 * Local reminder when the site/PWA is open near event start.
 * Prefer service-worker showNotification so notificationclick works;
 * falls back to page Notification API.
 */
export default function EventSoonNotifier({ tickets }: { tickets: TicketLike[] }) {
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!tickets?.length) return;
    if (Notification.permission !== 'granted') return;

    const soon = tickets.find((t) => {
      const start = t.booking?.startTime ? new Date(t.booking.startTime).getTime() : 0;
      const delta = start - Date.now();
      return delta > 0 && delta <= 2 * 3600 * 1000;
    });
    if (!soon?.booking?.title) return;

    const key = `yp_local_remind_${soon.booking.id || soon.ticketCode}`;
    if (sessionStorage.getItem(key)) return;

    const show = async () => {
      try {
        const reg = await navigator.serviceWorker?.ready;
        const opts = {
          body: soon.booking!.title!,
          icon: '/icons/icon-192.png',
          tag: key,
          data: { url: '/tickets' },
        };
        if (reg?.showNotification) {
          await reg.showNotification('Скоро мероприятие', opts);
        } else {
          new Notification('Скоро мероприятие', opts);
        }
        sessionStorage.setItem(key, '1');
      } catch {
        /* ignore */
      }
    };

    void show();
  }, [tickets]);

  return null;
}
