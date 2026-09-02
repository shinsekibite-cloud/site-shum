'use client';

import { CalendarPlus, Download, Smartphone } from 'lucide-react';
import {
  buildAndroidAddEventIntent,
  buildAndroidYandexLaunchIntent,
  buildEventIcs,
  buildIcsQuery,
  buildYandexCalendarUrl,
  isAndroidUa,
  isIosUa,
  toWebcalUrl,
  YANDEX_CALENDAR_ANDROID_PACKAGE,
} from '@/lib/ics';

type Props = {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: string | Date;
  end: string | Date;
  compact?: boolean;
};

/** Navigate via Intent URL while preserving the user-gesture (Chrome requirement). */
function openIntentUrl(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function AddToCalendarButton({
  uid,
  title,
  description,
  location,
  start,
  end,
  compact,
}: Props) {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);

  const eventOpts = {
    uid,
    title,
    description,
    location,
    start: startDate,
    end: endDate,
    url: typeof window !== 'undefined' ? window.location.origin + '/events' : undefined,
  };

  const icsHttpsUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/api/calendar/ics?${buildIcsQuery({ ...eventOpts, inline: true })}`;
  };

  const downloadIcs = () => {
    const ics = buildEventIcs(eventOpts);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\wа-яё\s-]+/gi, '').slice(0, 40) || 'event'}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /**
   * Open installed Yandex Calendar when possible.
   * Never navigate to calendar.yandex.ru on mobile — it 302s guests to 360 landing.
   */
  const openInYandex = (e: React.MouseEvent) => {
    e.preventDefault();
    const icsUrl = icsHttpsUrl();
    const webcal = toWebcalUrl(icsUrl);
    const eventFields = {
      title,
      description,
      location,
      start: startDate,
      end: endDate,
    };

    if (isAndroidUa()) {
      let cancelled = false;
      const onHide = () => {
        if (document.visibilityState === 'hidden') cancelled = true;
      };
      document.addEventListener('visibilitychange', onHide);

      // 1) Native «Add event» pinned to Yandex Calendar package
      openIntentUrl(
        buildAndroidAddEventIntent({
          ...eventFields,
          packageName: YANDEX_CALENDAR_ANDROID_PACKAGE,
          // ICS https only — never calendar.yandex.ru (360 redirect)
          fallbackUrl: icsUrl,
        })
      );

      // 2) If still here — chooser with any calendar app (incl. Yandex)
      window.setTimeout(() => {
        if (cancelled || document.visibilityState !== 'visible') return;
        openIntentUrl(
          buildAndroidAddEventIntent({
            ...eventFields,
            packageName: null,
            fallbackUrl: icsUrl,
          })
        );
      }, 1000);

      // 3) Launch Yandex Calendar app itself (home)
      window.setTimeout(() => {
        if (cancelled || document.visibilityState !== 'visible') return;
        openIntentUrl(buildAndroidYandexLaunchIntent(icsUrl));
      }, 2000);

      // 4) System calendar via webcal — pick Яндекс if set as handler
      window.setTimeout(() => {
        if (cancelled || document.visibilityState !== 'visible') return;
        window.location.href = webcal;
        document.removeEventListener('visibilitychange', onHide);
      }, 3000);
      return;
    }

    if (isIosUa()) {
      // webcal opens the system sheet — pick Яндекс Календарь if installed as handler
      window.location.href = webcal;
      return;
    }

    // Desktop only: Yandex create form (logged-in browser session)
    const yandexUrl = buildYandexCalendarUrl(eventFields);
    const win = window.open(yandexUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      window.location.href = yandexUrl;
    }
  };

  const row = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.45rem',
        width: '100%',
      }}
    >
      <button
        type="button"
        onClick={downloadIcs}
        className="btn btn-primary"
        style={{
          padding: compact ? '0.45rem 0.5rem' : '0.55rem 0.75rem',
          fontSize: compact ? '0.8rem' : '0.88rem',
          gap: 6,
          width: '100%',
          justifyContent: 'center',
        }}
      >
        <Download size={14} />
        Скачать .ics
      </button>
      <button
        type="button"
        onClick={openInYandex}
        className="btn btn-secondary"
        style={{
          padding: compact ? '0.45rem 0.5rem' : '0.55rem 0.75rem',
          fontSize: compact ? '0.8rem' : '0.88rem',
          width: '100%',
          justifyContent: 'center',
          textAlign: 'center',
          gap: 6,
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        <Smartphone size={14} />
        В приложение
      </button>
    </div>
  );

  if (compact) return row;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        marginTop: '0.75rem',
        padding: '0.85rem',
        borderRadius: 12,
        background: 'rgba(37,99,235,0.04)',
        border: '1px solid rgba(37,99,235,0.12)',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
        <CalendarPlus size={16} color="var(--primary)" />
        Добавить в календарь
      </div>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>
        «В приложение» открывает Яндекс Календарь на телефоне (если установлен) с формой нового
        события. Иначе — выбор системного календаря или .ics. Если не сработало — «Скачать .ics».
      </p>
      {row}
    </div>
  );
}
