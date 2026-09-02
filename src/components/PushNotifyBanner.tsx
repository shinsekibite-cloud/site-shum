'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { enableWebPush, getPushStatus, pushSupported, disableWebPush } from '@/lib/client-push';

/** Compact banner to enable browser push (tickets, check-in reminders). */
export default function PushNotifyBanner({ context = 'tickets' }: { context?: string }) {
  const [state, setState] = useState<'loading' | 'off' | 'on' | 'unsupported'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) {
      setState('unsupported');
      return;
    }
    getPushStatus().then((s) => setState(s.subscribed ? 'on' : 'off')).catch(() => setState('off'));
  }, []);

  if (state === 'unsupported' || state === 'loading' || state === 'on') return null;

  const enable = async () => {
    setBusy(true);
    try {
      const r = await enableWebPush();
      if (!r.ok) throw new Error(r.message || 'Не удалось');
      setState('on');
      toast.success('Уведомления включены');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="push-banner" data-context={context}>
      <div className="push-banner__text">
        <Bell size={18} aria-hidden />
        <div>
          <strong>Напоминания о мероприятиях</strong>
          <span>Пуш когда билет активирован или скоро начало</span>
        </div>
      </div>
      <button type="button" className="btn btn-primary push-banner__btn" disabled={busy} onClick={() => void enable()}>
        {busy ? '…' : 'Включить'}
      </button>
      <button type="button" className="push-banner__dismiss" aria-label="Скрыть" onClick={() => setState('on')}>
        <BellOff size={16} />
      </button>
    </div>
  );
}
