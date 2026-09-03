'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Signup = {
  id: string;
  status: string;
  period: string;
  startTime: string;
  endTime: string;
  seats: number;
  space: { id: string; title: string; address: string | null };
};

export default function CoworkingCabinetList() {
  const [rows, setRows] = useState<Signup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((opts?: { soft?: boolean }) => {
    setLoading((prev) => (opts?.soft ? prev : true));
    fetch('/api/coworking?mine=1', { credentials: 'same-origin' })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || 'Ошибка');
        setRows(data.signups || []);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function cancel(id: string) {
    const r = await fetch(`/api/coworking?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(data.message || 'Не удалось отменить');
      return;
    }
    load({ soft: rows.length > 0 });
  }

  return (
    <section className="cw-cabinet" aria-label="Мои записи в коворкинг">
      <div className="cw-cabinet-head">
        <h2>Мои записи</h2>
        <Link href="/coworking" className="svc-pill svc-pill--brand">
          Записаться
        </Link>
      </div>
      {error ? <p className="cw-error">{error}</p> : null}
      {loading && rows.length === 0 ? (
        <div className="svc-skel" aria-hidden>
          <div className="svc-skel__pill" />
          <div className="svc-skel__pill" />
        </div>
      ) : null}
      {!loading && rows.length === 0 ? (
        <p className="svc-empty-inline">
          Пока нет записей. <Link href="/coworking">Записаться в коворкинг</Link>
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="cw-cabinet-pills">
          {rows.map((row) => {
            const day = new Date(row.startTime).toLocaleDateString('ru-RU', {
              timeZone: 'Europe/Moscow',
              day: 'numeric',
              month: 'short',
            });
            const slot = `${new Date(row.startTime).toLocaleTimeString('ru-RU', {
              timeZone: 'Europe/Moscow',
              hour: '2-digit',
              minute: '2-digit',
            })}–${new Date(row.endTime).toLocaleTimeString('ru-RU', {
              timeZone: 'Europe/Moscow',
              hour: '2-digit',
              minute: '2-digit',
            })}`;
            return (
              <li key={row.id} className="cw-cabinet-pill">
                <span className="cw-cabinet-pill__day">{day}</span>
                <span className="cw-cabinet-pill__slot">{slot}</span>
                <span className="cw-cabinet-pill__place">{row.space.title}</span>
                <span className={`cw-cabinet-pill__status status-${row.status.toLowerCase()}`}>
                  {statusRu(row.status)}
                </span>
                {['PENDING', 'CONFIRMED', 'WAITLIST'].includes(row.status) ? (
                  <button type="button" className="cw-cabinet-pill__cancel" onClick={() => cancel(row.id)}>
                    Отменить
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function statusRu(s: string) {
  switch (s) {
    case 'PENDING':
      return 'ожидает';
    case 'CONFIRMED':
      return 'подтверждена';
    case 'CANCELLED':
      return 'отменена';
    case 'ATTENDED':
      return 'визит';
    case 'NO_SHOW':
      return 'неявка';
    case 'WAITLIST':
      return 'лист ожидания';
    default:
      return s;
  }
}
