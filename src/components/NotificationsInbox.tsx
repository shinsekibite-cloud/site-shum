'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  notificationTypeLabel,
  parseNotificationMeta,
  resolveNotificationHref,
} from '@/lib/notification-meta';

type Item = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  meta?: string | null;
};

export default function NotificationsInbox() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch('/api/user/notifications?take=80', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.items)) setItems(d.items);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="profile-view" style={{ maxWidth: 720, margin: '0 auto', padding: '1rem 0.85rem 5rem' }}>
      <div className="profile-page-head">
        <div>
          <h1 className="profile-view__title">История уведомлений</h1>
          <p className="profile-view__lead">Покупки за эко, модерация, заявки и сообщения — всё в одном списке.</p>
        </div>
        <Link href="/dashboard" className="btn btn-secondary">
          К профилю
        </Link>
        {items.some((i) => !i.readAt) ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              await fetch('/api/user/notifications', {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ all: true }),
              });
              load();
            }}
          >
            Прочитать все
          </button>
        ) : null}
      </div>
      {loading ? (
        <p className="profile-view__lead">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="profile-empty">Пока нет уведомлений. Покупка в магазине, заявки и сообщения появятся здесь.</p>
      ) : (
        <ul className="yp-notif-inbox">
          {items.map((n) => {
            const href = resolveNotificationHref(n);
            const meta = parseNotificationMeta(n.meta);
            return (
              <li key={n.id} className={n.readAt ? '' : 'is-unread'}>
                <Link
                  href={href || '/dashboard'}
                  onClick={() => {
                    if (!n.readAt) {
                      void fetch('/api/user/notifications', {
                        method: 'PATCH',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: n.id }),
                      });
                    }
                  }}
                >
                  <span className="yp-notif-panel__type-chip">{notificationTypeLabel(n.type)}</span>
                  <strong>{n.title}</strong>
                  <em>{n.body}</em>
                  <time dateTime={n.createdAt}>
                    {new Date(n.createdAt).toLocaleString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Europe/Moscow',
                    })}
                  </time>
                  {typeof meta.kind === 'string' ? null : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
