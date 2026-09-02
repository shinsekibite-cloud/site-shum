'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import type { DayGrid, OccupancySlot, SlotStatus } from '@/lib/hall-occupancy';
import { slotStatusLabel } from '@/lib/hall-occupancy';
import { encodeRouteParam } from '@/lib/route-id';
import { X } from 'lucide-react';

const BookingCalendar = dynamic(() => import('@/components/BookingCalendar'), { ssr: false });

type Props = {
  spaceId: string;
  bookBaseHref?: string;
};

const STATUS_CLASS: Record<SlotStatus, string> = {
  free: 'occ-free',
  busy_event: 'occ-busy-event',
  busy_booking: 'occ-busy-booking',
  service: 'occ-service',
  closed: 'occ-closed',
};

function slotTime(slot: OccupancySlot) {
  const h1 = String(Math.floor(slot.startMin / 60)).padStart(2, '0');
  const m1 = String(slot.startMin % 60).padStart(2, '0');
  const h2 = String(Math.floor(slot.endMin / 60)).padStart(2, '0');
  const m2 = String(slot.endMin % 60).padStart(2, '0');
  return `${h1}:${m1}–${h2}:${m2}`;
}

function minsToHhMm(min: number) {
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export default function HallWeekGrid({ spaceId, bookBaseHref }: Props) {
  const { status } = useSession();
  const [week, setWeek] = useState<DayGrid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [meta, setMeta] = useState<{
    title?: string;
    capacity?: number;
    openMin?: number;
    closeMin?: number;
  }>({});
  const [panel, setPanel] = useState<{ start: string; end: string } | null>(null);
  const [guestGate, setGuestGate] = useState(false);
  const bookHref = bookBaseHref || `/spaces/${encodeRouteParam(spaceId)}/book`;
  const authed = status === 'authenticated';

  useEffect(() => {
    let cancelled = false;
    // Soft refresh: keep the previous week visible; only skeleton when empty.
    setLoading((prev) => (week.length === 0 ? true : prev));
    fetch(`/api/spaces/${encodeURIComponent(spaceId)}/occupancy`, { credentials: 'same-origin' })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || 'Ошибка');
        if (!cancelled) {
          setWeek(data.week || []);
          setMeta({
            title: data.title,
            capacity: data.capacity,
            openMin: data.openMin,
            closeMin: data.closeMin,
          });
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Не удалось загрузить сетку');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- soft-load uses current week length once per spaceId
  }, [spaceId]);

  useEffect(() => {
    if (!panel && !guestGate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(null);
        setGuestGate(false);
      }
    };
    document.body.classList.add('yp-sheet-open');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('yp-sheet-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [panel, guestGate]);

  const day = week[dayIdx] || null;
  const legend = useMemo(
    () =>
      (['free', 'busy_event', 'busy_booking', 'service', 'closed'] as SlotStatus[]).map((s) => ({
        s,
        label: slotStatusLabel(s),
      })),
    []
  );

  const openTime = typeof meta.openMin === 'number' ? minsToHhMm(meta.openMin) : '09:00';
  const closeTime = typeof meta.closeMin === 'number' ? minsToHhMm(meta.closeMin) : '21:00';

  const openSlot = (start: string, end: string) => {
    if (!authed) {
      setPanel({ start, end });
      setGuestGate(true);
      return;
    }
    setGuestGate(false);
    setPanel({ start, end });
  };

  const closeDrawer = () => {
    setPanel(null);
    setGuestGate(false);
  };

  const loginHref = panel
    ? `/login?callbackUrl=${encodeURIComponent(`${bookHref}?start=${encodeURIComponent(panel.start)}&end=${encodeURIComponent(panel.end)}`)}`
    : `/login?callbackUrl=${encodeURIComponent(bookHref)}`;
  const registerHref = panel
    ? `/register?callbackUrl=${encodeURIComponent(`${bookHref}?start=${encodeURIComponent(panel.start)}&end=${encodeURIComponent(panel.end)}`)}`
    : `/register?callbackUrl=${encodeURIComponent(bookHref)}`;

  return (
    <section className="hall-week" aria-label="Занятость зала на неделю">
      <div className="hall-week-head">
        <div>
          <h2 className="hall-week-title">Занятость на неделю</h2>
          <p className="hall-week-sub">Клик по свободному слоту — форма брони рядом</p>
        </div>
        <div className="hall-week-legend">
          {legend.map((l) => (
            <span key={l.s} className={`hall-week-pill ${STATUS_CLASS[l.s]}`}>
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {loading && week.length === 0 ? (
        <div className="svc-skel" aria-hidden>
          <div className="svc-skel__pill" />
          <div className="svc-skel__pill" />
          <div className="svc-skel__row" />
          <div className="svc-skel__row" />
        </div>
      ) : null}
      {error ? <p className="hall-week-error">{error}</p> : null}

      {week.length > 0 ? (
        <div className="hall-week-days" role="tablist">
          {week.map((d, i) => (
            <button
              key={d.dayKey}
              type="button"
              role="tab"
              aria-selected={i === dayIdx}
              className={`hall-week-day${i === dayIdx ? ' is-active' : ''}`}
              onClick={() => setDayIdx(i)}
            >
              {d.label}
            </button>
          ))}
        </div>
      ) : null}

      {day ? (
        <div className="hall-week-timeline" role="list">
          {day.slots.map((slot) => {
            const free = slot.status === 'free';
            const content = (
              <>
                <span className="hall-week-time">{slotTime(slot)}</span>
                <span className="hall-week-label">
                  {free ? 'Свободно' : slot.label || slotStatusLabel(slot.status)}
                </span>
              </>
            );
            if (free) {
              return (
                <button
                  key={slot.start}
                  type="button"
                  className={`hall-week-slot ${STATUS_CLASS[slot.status]}`}
                  role="listitem"
                  onClick={() => openSlot(slot.start, slot.end)}
                >
                  {content}
                </button>
              );
            }
            return (
              <div key={slot.start} className={`hall-week-slot ${STATUS_CLASS[slot.status]}`} role="listitem">
                {content}
              </div>
            );
          })}
        </div>
      ) : null}

      {panel ? (
        <div className="svc-drawer" role="dialog" aria-modal="true" aria-label="Бронирование слота">
          <button type="button" className="svc-drawer__backdrop" aria-label="Закрыть" onClick={closeDrawer} />
          <div className="svc-drawer__panel">
            <header className="svc-drawer__head">
              <div>
                <h3>{guestGate ? 'Нужен аккаунт' : `Бронь: ${meta.title || 'Площадка'}`}</h3>
                <p>
                  {new Date(panel.start).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} –{' '}
                  {new Date(panel.end).toLocaleTimeString('ru-RU', {
                    timeZone: 'Europe/Moscow',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <button type="button" className="svc-drawer__close" onClick={closeDrawer} aria-label="Закрыть">
                <X size={20} />
              </button>
            </header>
            <div className="svc-drawer__body">
              {guestGate ? (
                <div className="yp-guest-prompt__actions" style={{ display: 'grid', gap: '0.75rem' }}>
                  <p className="hall-week-sub" style={{ margin: 0 }}>
                    Бронь зала доступна после входа. Можно сразу создать аккаунт — слот сохранится в ссылке.
                  </p>
                  <Link href={loginHref} className="btn btn-primary" onClick={closeDrawer}>
                    Войти
                  </Link>
                  <Link href={registerHref} className="btn btn-secondary" onClick={closeDrawer}>
                    Регистрация
                  </Link>
                </div>
              ) : (
                <>
                  <BookingCalendar
                    spaceId={spaceId}
                    spaceCapacity={meta.capacity || 50}
                    openTime={openTime}
                    closeTime={closeTime}
                    initialStartIso={panel.start}
                    initialEndIso={panel.end}
                  />
                  <p className="svc-drawer__alt">
                    Нужна полная форма?{' '}
                    <a href={`${bookHref}?start=${encodeURIComponent(panel.start)}&end=${encodeURIComponent(panel.end)}`}>
                      Открыть страницу брони
                    </a>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
