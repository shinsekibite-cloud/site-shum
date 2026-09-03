'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import JoinEventButton from '@/components/JoinEventButton';

type ApiEvent = {
  id: string;
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  space?: { title?: string; address?: string } | null;
  participantsCount?: number;
  joinedByMe?: boolean;
};

/** Private afisha: no event payload in static HTML. Logged-in users fetch /api/events. */
export default function AuthAfishaSection({ hideTitle }: { hideTitle?: boolean }) {
  const { status } = useSession();
  const [events, setEvents] = useState<ApiEvent[] | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/events')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelled) setEvents(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status !== 'authenticated') {
    return (
      <div className="event-empty glass">
        <h3>Афиша доступна после входа</h3>
        <p>Войдите в аккаунт, чтобы увидеть ближайшие мероприятия.</p>
        <Link href="/login?callbackUrl=/events" className="btn btn-primary">
          Войти
        </Link>
      </div>
    );
  }

  if (events == null) {
    return <p style={{ color: 'var(--muted)' }}>Загрузка афиши…</p>;
  }

  if (!events.length) {
    return (
      <div className="event-empty glass">
        <h3>Ближайших мероприятий пока нет</h3>
        <Link href="/spaces" className="btn btn-primary">
          Площадки
        </Link>
      </div>
    );
  }

  return (
    <div className="event-list">
      {!hideTitle ? (
        <div className="event-list-head">
          <h2>Афиша мероприятий</h2>
        </div>
      ) : null}
      <div className="event-grid">
        {events.slice(0, 20).map((e) => (
          <article key={e.id} className="glass event-card">
            <div className="event-card-body">
              <h3 className="event-card-title">{e.title}</h3>
              <p className="event-card-desc">{e.space?.title}</p>
              <JoinEventButton
                eventId={e.id}
                initialIsJoined={Boolean(e.joinedByMe)}
                initialIsFull={false}
                initialAvailableSeats={99}
                title={e.title}
                startTime={e.startTime}
                endTime={e.endTime}
                location={[e.space?.title, e.space?.address].filter(Boolean).join(', ')}
                description={e.description}
                compact
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
