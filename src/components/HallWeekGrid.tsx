'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { DayGrid, OccupancySlot, SlotStatus } from '@/lib/hall-occupancy';
import { slotStatusLabel } from '@/lib/hall-occupancy';
import { encodeRouteParam } from '@/lib/route-id';

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

export default function HallWeekGrid({ spaceId, bookBaseHref }: Props) {
  const [week, setWeek] = useState<DayGrid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const bookHref = bookBaseHref || `/spaces/${encodeRouteParam(spaceId)}/book`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/spaces/${encodeURIComponent(spaceId)}/occupancy`, { credentials: 'same-origin' })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || 'Ошибка');
        if (!cancelled) {
          setWeek(data.week || []);
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
  }, [spaceId]);

  const day = week[dayIdx] || null;
  const legend = useMemo(
    () =>
      (['free', 'busy_event', 'busy_booking', 'service', 'closed'] as SlotStatus[]).map((s) => ({
        s,
        label: slotStatusLabel(s),
      })),
    []
  );

  return (
    <section className="hall-week" aria-label="Занятость зала на неделю">
      <div className="hall-week-head">
        <div>
          <h2 className="hall-week-title">Занятость на неделю</h2>
          <p className="hall-week-sub">Клик по свободному слоту — сразу к брони</p>
        </div>
        <div className="hall-week-legend">
          {legend.map((l) => (
            <span key={l.s} className={`hall-week-pill ${STATUS_CLASS[l.s]}`}>
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {loading ? <p className="hall-week-muted">Загружаем сетку…</p> : null}
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
              const href = `${bookHref}?start=${encodeURIComponent(slot.start)}&end=${encodeURIComponent(slot.end)}`;
              return (
                <Link key={slot.start} href={href} className={`hall-week-slot ${STATUS_CLASS[slot.status]}`} role="listitem">
                  {content}
                </Link>
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
    </section>
  );
}
