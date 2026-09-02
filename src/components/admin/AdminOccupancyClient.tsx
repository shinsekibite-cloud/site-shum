'use client';

import { useEffect, useState } from 'react';

type Hall = {
  spaceId: string;
  title: string;
  category: string;
  capacity: number;
  loadPct: number;
  slots: Array<{
    start: string;
    end: string;
    startMin: number;
    status: string;
    label: string | null;
  }>;
};

function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default function AdminOccupancyClient() {
  const [day, setDay] = useState(todayYmd());
  const [halls, setHalls] = useState<Hall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('Уборка');
  const [blocking, setBlocking] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/occupancy?day=${encodeURIComponent(day)}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || 'Ошибка');
        setHalls(data.halls || []);
      })
      .catch((e) => setError(e.message));
  }, [day]);

  async function blockSlot(spaceId: string, start: string, end: string) {
    setBlocking(spaceId + start);
    setError(null);
    try {
      const r = await fetch('/api/admin/occupancy', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId, startTime: start, endTime: end, kind: 'SERVICE', note }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Конфликт');
      const refreshed = await fetch(`/api/admin/occupancy?day=${encodeURIComponent(day)}`, {
        credentials: 'same-origin',
      });
      const body = await refreshed.json();
      setHalls(body.halls || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBlocking(null);
    }
  }

  return (
    <div className="admin-occ">
      <div className="admin-occ-toolbar">
        <label>
          День
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label>
          Подпись блокировки
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {error ? <p className="cw-error">{error}</p> : null}
      <div className="admin-occ-halls">
        {halls.map((hall) => (
          <section key={hall.spaceId} className="admin-occ-hall">
            <header>
              <h2>{hall.title}</h2>
              <span>
                {hall.category} · загрузка {hall.loadPct}%
              </span>
            </header>
            <div className="admin-occ-slots">
              {hall.slots.map((slot) => (
                <div key={slot.start} className={`admin-occ-slot is-${slot.status}`}>
                  <span>
                    {String(Math.floor(slot.startMin / 60)).padStart(2, '0')}:
                    {String(slot.startMin % 60).padStart(2, '0')} · {slot.label || slot.status}
                  </span>
                  {slot.status === 'free' ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={blocking === hall.spaceId + slot.start}
                      onClick={() => blockSlot(hall.spaceId, slot.start, slot.end)}
                    >
                      Блок
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
