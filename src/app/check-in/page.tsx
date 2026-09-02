'use client';

import { useSafeSearchParams } from '@/lib/use-safe-search-params';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Leaf, Loader2, LogIn, MapPin, Ticket, XCircle } from 'lucide-react';
import PushNotifyBanner from '@/components/PushNotifyBanner';

type Result = {
  ok?: boolean;
  status?: string;
  ticketStatus?: 'ACTIVATED' | 'USED';
  message?: string;
  ecoEarned?: number;
  ecoPoints?: number;
  event?: { title: string; space?: { title?: string; address?: string | null } | null };
  checkedAt?: string;
};

function CheckInInner() {
  const { data: session, status } = useSession();
  const sp = useSafeSearchParams();
  const router = useRouter();
  const code = (sp.get('code') || '').trim();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (!code) {
      setResult({ ok: false, status: 'INVALID', message: 'В QR нет кода входа' });
      return;
    }
    if (status !== 'authenticated') return;

    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await fetch('/api/check-in/venue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setResult({ ok: false, message: 'Не удалось отметить приход' });
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, code]);

  if (!code) {
    return <Fail message="Некорректный QR. Попросите актуальный код у администратора." />;
  }

  if (status === 'unauthenticated') {
    const cb = `/check-in?code=${encodeURIComponent(code)}`;
    return (
      <Card>
        <LogIn size={36} className="check-in-card__icon" style={{ color: 'var(--primary)' }} aria-hidden />
        <h1 className="check-in-card__title">Отметка на входе</h1>
        <p className="check-in-card__text">
          Войдите — отметим на мероприятие, на которое вы записаны: можно до начала, во время и чуть
          после (если событий несколько — ближайшее / идущее сейчас).
        </p>
        <div className="check-in-card__actions">
          <Link href={`/login?callbackUrl=${encodeURIComponent(cb)}`} className="btn btn-primary">
            Войти и отметиться
          </Link>
        </div>
      </Card>
    );
  }

  if (busy || status === 'loading' || !result) {
    return (
      <Card>
        <Loader2 size={36} className="check-in-spin" style={{ color: 'var(--primary)' }} aria-hidden />
        <h1 className="check-in-card__title">Отмечаем приход…</h1>
        <p className="check-in-card__text">Ищем ближайшую запись на сегодня</p>
      </Card>
    );
  }

  if (result.ok) {
    const activated = result.ticketStatus === 'ACTIVATED';
    const used = result.ticketStatus === 'USED' || result.status === 'ALREADY';
    return (
      <Card>
        <CheckCircle2
          size={40}
          style={{ color: used ? '#ca8a04' : '#15803d', marginBottom: 12 }}
          aria-hidden
        />
        <div className={`check-in-status check-in-status--${used ? 'used' : 'activated'}`}>
          {used ? 'Билет использован' : 'Билет активирован'}
        </div>
        <h1 className="check-in-card__title">{used ? 'Вы уже отмечены' : 'Добро пожаловать!'}</h1>
        <p className="check-in-card__text">{result.message}</p>
        {typeof result.ecoEarned === 'number' && result.ecoEarned > 0 && (
          <p className="check-in-eco">
            <Leaf size={16} aria-hidden /> +{result.ecoEarned} мбаллов
            {typeof result.ecoPoints === 'number' ? ` · всего ${result.ecoPoints}` : ''}
          </p>
        )}
        {result.event && (
          <div className="check-in-card__event">
            <div style={{ fontWeight: 700 }}>{result.event.title}</div>
            {result.event.space?.title && (
              <div className="check-in-card__space">
                <MapPin size={14} aria-hidden /> {result.event.space.title}
              </div>
            )}
          </div>
        )}
        <PushNotifyBanner context="check-in" />
        <div className="check-in-card__actions">
          <Link href="/tickets" className="btn btn-primary">
            <Ticket size={18} aria-hidden />
            Мои билеты
          </Link>
          <button type="button" className="btn btn-secondary" onClick={() => router.push('/events')}>
            К афише
          </button>
        </div>
      </Card>
    );
  }

  return <Fail message={result.message || 'Не удалось отметить'} />;
}

function Fail({ message }: { message: string }) {
  return (
    <Card>
      <XCircle size={40} style={{ color: '#b91c1c', marginBottom: 12 }} aria-hidden />
      <h1 className="check-in-card__title">Не отмечено</h1>
      <p className="check-in-card__text">{message}</p>
      <div className="check-in-card__actions">
        <Link href="/events" className="btn btn-primary">
          К афише
        </Link>
        <Link href="/tickets" className="btn btn-secondary">
          Мои билеты
        </Link>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="check-in-page">
      <div className="glass check-in-card">{children}</div>
    </div>
  );
}

export default function CheckInPage() {
  return <CheckInInner />;
}
