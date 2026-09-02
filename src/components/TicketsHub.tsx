'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Ban,
  CalendarDays,
  ChevronRight,
  Maximize2,
  Minimize2,
  MapPin,
  Printer,
  QrCode,
  ScanLine,
  Ticket,
  X,
} from 'lucide-react';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import AddToCalendarButton from '@/components/AddToCalendarButton';
import { formatMskDateTime } from '@/lib/booking-hours';
import toast from 'react-hot-toast';
import PushNotifyBanner from '@/components/PushNotifyBanner';

type Participation = {
  id: string;
  ticketCode: string;
  booking: {
    id: string;
    title: string;
    description?: string | null;
    startTime: string;
    endTime: string;
    space?: { title?: string; address?: string | null } | null;
  };
};

export default function TicketsHub({ standalone = false }: { standalone?: boolean }) {
  const { data: session, status } = useSession();
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/participations');
      if (!res.ok) throw new Error('Не удалось загрузить билеты');
      const data = await res.json();
      setParticipations(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') load();
    if (status === 'unauthenticated') setLoading(false);
  }, [status, load]);

  const tickets = useMemo(() => {
    const now = Date.now();
    return [...participations]
      .filter((p) => p?.booking?.endTime && new Date(p.booking.endTime).getTime() >= now - 6 * 3600000)
      .sort((a, b) => new Date(a.booking.startTime).getTime() - new Date(b.booking.startTime).getTime());
  }, [participations]);

  useEffect(() => {
    if (!selectedCode && tickets[0]?.ticketCode) setSelectedCode(tickets[0].ticketCode);
  }, [tickets, selectedCode]);

  const selected = tickets.find((t) => t.ticketCode === selectedCode) || tickets[0];

  const cancelParticipation = async (bookingId: string) => {
    if (!bookingId || ticketBusy) return;
    if (!window.confirm('Отменить участие? Билет станет недействительным.')) return;
    setTicketBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Не удалось отменить');
      toast.success(data.message || 'Участие отменено');
      setSelectedCode(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setTicketBusy(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="tickets-hub tickets-hub--loading">
        <p className="tickets-hub__muted">Загрузка билетов…</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="tickets-hub tickets-hub--guest">
        <div className="tickets-hub__empty">
          <Ticket size={48} className="tickets-hub__empty-icon" aria-hidden />
          <h2>Войдите, чтобы увидеть билеты</h2>
          <p>QR-код билета покажем здесь — покажите его на входе или отсканируйте у стойки.</p>
          <Link href="/login?callbackUrl=%2Ftickets" className="btn btn-primary">
            Войти
          </Link>
          <Link href="/events" className="btn btn-secondary">
            Афиша мероприятий
          </Link>
        </div>
      </div>
    );
  }

  const canScan =
    session?.user?.role === 'ADMIN' ||
    session?.user?.role === 'MODERATOR' ||
    session?.user?.role === 'SCANNER';

  return (
    <>
      <div className={`tickets-hub${standalone ? ' tickets-hub--standalone' : ''}`}>
        {standalone && (
          <header className="tickets-hub__header">
            <div>
              <h1 className="page-hero-title">
                <Ticket size={28} aria-hidden />
                Мои события и билеты
              </h1>
              <p className="page-hero-subtitle" style={{ textAlign: 'left', marginBottom: 0 }}>
                Покажите QR на входе. На двери организации — общий QR, он активирует билет автоматически.
              </p>
            </div>
            {canScan && (
              <Link href="/scanner" className="btn btn-secondary tickets-hub__scan-link">
                <ScanLine size={18} aria-hidden />
                Сканер входа
              </Link>
            )}
          </header>
        )}

        {standalone && <PushNotifyBanner context="tickets" />}

        {!standalone && (
          <>
            <h2 className="tickets-hub__title">Мои билеты</h2>
            <p className="tickets-hub__lead">
              Откройте{' '}
              <Link href="/tickets" className="tickets-hub__open-full">
                отдельную страницу билетов
              </Link>{' '}
              для крупного QR на входе.
            </p>
          </>
        )}

        {tickets.length === 0 ? (
          <div className="tickets-hub__empty">
            <QrCode size={40} className="tickets-hub__empty-icon" aria-hidden />
            <h2>Билетов пока нет</h2>
            <p>Запишитесь на мероприятие в афише — билет появится здесь автоматически.</p>
            <Link href="/events" className="btn btn-primary">
              К афише
            </Link>
          </div>
        ) : (
          <div className="tickets-hub__grid">
            <article className="tickets-hub__qr-card">
              {selected && (
                <>
                  <div className="tickets-hub__qr-wrap">
                    <QRCodeDisplay value={selected.ticketCode} size={standalone ? 220 : 180} />
                    <button
                      type="button"
                      className="tickets-hub__fullscreen-btn"
                      onClick={() => setFullscreen(true)}
                      aria-label="QR на весь экран"
                    >
                      <Maximize2 size={18} />
                      На весь экран
                    </button>
                    <button
                      type="button"
                      className="tickets-hub__fullscreen-btn tickets-hub__print-btn"
                      onClick={() => window.print()}
                      aria-label="Распечатать QR"
                    >
                      <Printer size={18} />
                      Печать
                    </button>
                  </div>
                  <h3 className="tickets-hub__event-title">{selected.booking.title}</h3>
                  <p className="tickets-hub__event-meta">
                    <MapPin size={14} aria-hidden />
                    {selected.booking.space?.title || 'Площадка'}
                  </p>
                  <p className="tickets-hub__event-time">
                    <CalendarDays size={14} aria-hidden />
                    {formatMskDateTime(selected.booking.startTime)} (МСК)
                  </p>
                  <p className="tickets-hub__code">{selected.ticketCode}</p>
                  <div className="ticket-actions-row">
                    <AddToCalendarButton
                      uid={selected.booking.id}
                      title={selected.booking.title}
                      description={selected.booking.description}
                      location={[selected.booking.space?.title, selected.booking.space?.address]
                        .filter(Boolean)
                        .join(', ')}
                      start={selected.booking.startTime}
                      end={selected.booking.endTime}
                      compact
                    />
                    <button
                      type="button"
                      className="btn btn-secondary ticket-cancel-btn"
                      disabled={ticketBusy}
                      onClick={() => cancelParticipation(selected.booking.id)}
                    >
                      <Ban size={16} aria-hidden />
                      {ticketBusy ? 'Отмена…' : 'Отменить'}
                    </button>
                  </div>
                </>
              )}
            </article>

            <div className="tickets-hub__list">
              <h3 className="tickets-hub__list-title">Все билеты ({tickets.length})</h3>
              {tickets.map((part) => {
                const active = selected?.ticketCode === part.ticketCode;
                return (
                  <button
                    key={part.id}
                    type="button"
                    className={`tickets-hub__list-item${active ? ' is-active' : ''}`}
                    onClick={() => setSelectedCode(part.ticketCode)}
                  >
                    <div className="tickets-hub__list-body">
                      <span className="tickets-hub__list-name">{part.booking.title}</span>
                      <span className="tickets-hub__list-sub">
                        {part.booking.space?.title} · {formatMskDateTime(part.booking.startTime)}
                      </span>
                    </div>
                    <ChevronRight size={18} aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {fullscreen && selected && (
        <div className="tickets-fullscreen" role="dialog" aria-modal="true" aria-label="QR билета">
          <button
            type="button"
            className="tickets-fullscreen__close"
            onClick={() => setFullscreen(false)}
            aria-label="Закрыть"
          >
            <X size={24} />
          </button>
          <div className="tickets-fullscreen__inner">
            <QRCodeDisplay value={selected.ticketCode} size={Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 48 : 280)} />
            <p className="tickets-fullscreen__title">{selected.booking.title}</p>
            <p className="tickets-fullscreen__hint">Покажите код сотруднику на входе</p>
            <button type="button" className="btn btn-secondary" onClick={() => setFullscreen(false)}>
              <Minimize2 size={16} aria-hidden />
              Свернуть
            </button>
          </div>
        </div>
      )}
    </>
  );
}
