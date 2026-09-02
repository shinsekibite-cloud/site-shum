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

  const load = useCallback(() => {
    fetch('/api/coworking?mine=1', { credentials: 'same-origin' })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || 'Ошибка');
        setRows(data.signups || []);
      })
      .catch((e) => setError(e.message));
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
    load();
  }

  return (
    <section className="cw-cabinet" aria-label="Мои записи в коворкинг">
      <div className="cw-cabinet-head">
        <h2>Мои записи в коворкинг</h2>
        <Link href="/coworking" className="btn btn-primary">
          Записаться
        </Link>
      </div>
      {error ? <p className="cw-error">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="presence-muted">Пока нет активных записей.</p>
      ) : (
        <ul className="cw-cabinet-list">
          {rows.map((row) => {
            const today =
              new Date(row.startTime).toDateString() === new Date().toDateString() &&
              ['CONFIRMED', 'PENDING', 'ATTENDED'].includes(row.status);
            return (
              <li key={row.id}>
                <div>
                  <strong>{row.space.title}</strong>
                  <span>
                    {new Date(row.startTime).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} · {row.seats} мест ·{' '}
                    {statusRu(row.status)}
                  </span>
                  {today ? <em className="cw-today">Сегодня — покажите QR на входе</em> : null}
                </div>
                {['PENDING', 'CONFIRMED', 'WAITLIST'].includes(row.status) ? (
                  <button type="button" className="btn btn-secondary" onClick={() => cancel(row.id)}>
                    Отменить
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
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
      return 'визит состоялся';
    case 'NO_SHOW':
      return 'неявка';
    case 'WAITLIST':
      return 'лист ожидания';
    default:
      return s;
  }
}
