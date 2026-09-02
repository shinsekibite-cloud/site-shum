'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { KeyRound, LogIn, LogOut, Shield } from 'lucide-react';
import TotpSetupPanel from '@/components/TotpSetupPanel';
import SessionSecurityPanel from '@/components/SessionSecurityPanel';
import { signOutLogged } from '@/lib/sign-out-logged';

type EventRow = {
  id: string;
  ip: string | null;
  deviceLabel: string | null;
  kind: string;
  createdAt: string;
};

function kindLabel(kind: string) {
  if (kind === 'LOGOUT') return 'Выход';
  if (kind === 'LOGIN') return 'Вход';
  if (kind === 'REVOKE') return 'Сброс сеансов';
  if (kind === 'PASSWORD') return 'Смена пароля';
  return kind;
}

export default function OpsAccountPanel() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/user/security', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data.events) ? data.events : [];
      setEvents(
        rows.filter(
          (e: EventRow) =>
            e.kind === 'LOGIN' || e.kind === 'LOGOUT' || e.kind === 'REVOKE' || e.kind === 'PASSWORD'
        )
      );
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  return (
    <div style={{ display: 'grid', gap: '1.15rem' }}>
      <section className="card-surface" style={{ padding: '1rem 1.1rem' }}>
        <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={18} aria-hidden /> Учётка TECH
        </h2>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.45 }}>
          Скрыта от админов в списках пользователей и поиске. Здесь — журнал входов/выходов, пароль и 2FA.
        </p>
      </section>

      <section className="card-surface" style={{ padding: '1rem 1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogIn size={16} aria-hidden /> Журнал входов и выходов
          </h3>
          <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }} onClick={() => void loadEvents()}>
            Обновить
          </button>
        </div>
        {!loaded ? (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem' }}>Загрузка…</p>
        ) : events.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem' }}>Пока нет записей</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {events.slice(0, 25).map((e) => (
              <li
                key={e.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '0.55rem 0.65rem',
                  borderRadius: 10,
                  background: 'rgba(15,23,42,0.03)',
                  fontSize: '0.82rem',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontWeight: 750 }}>{kindLabel(e.kind)}</strong>
                  <span style={{ color: 'var(--muted)' }}>
                    {' '}
                    · {e.deviceLabel || 'устройство'}
                    {e.ip ? ` · ${e.ip}` : ''}
                  </span>
                </span>
                <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                  {new Date(e.createdAt).toLocaleString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Europe/Moscow',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-surface" style={{ padding: '1rem 1.1rem' }}>
        <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <KeyRound size={16} aria-hidden /> Смена пароля
        </h3>
        <p style={{ margin: '0 0 0.75rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
          Минимум 10 символов, буквы и цифры. Другие сеансы будут завершены.
        </p>
        <form
          style={{ display: 'grid', gap: 10, maxWidth: 420 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const currentPassword = String(fd.get('currentPassword') || '');
            const password = String(fd.get('password') || '');
            if (password.length < 10 || !/[A-Za-zА-Яа-я]/.test(password) || !/\d/.test(password)) {
              toast.error('Пароль: минимум 10 символов, буквы и цифры');
              return;
            }
            setBusy(true);
            try {
              const res = await fetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, password }),
              });
              const json = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(json.message || 'Не удалось сменить пароль');
              toast.success('Пароль обновлён');
              e.currentTarget.reset();
              void loadEvents();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Ошибка');
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="yp-field">
            <span>Текущий пароль</span>
            <input name="currentPassword" type="password" autoComplete="current-password" required />
          </label>
          <label className="yp-field">
            <span>Новый пароль</span>
            <input name="password" type="password" autoComplete="new-password" minLength={10} required />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Обновить пароль
          </button>
        </form>
      </section>

      <section className="card-surface" style={{ padding: '1rem 1.1rem' }}>
        <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.95rem', fontWeight: 800 }}>Двухфакторная аутентификация</h3>
        <TotpSetupPanel />
      </section>

      <section className="card-surface" style={{ padding: '1rem 1.1rem' }}>
        <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.95rem', fontWeight: 800 }}>Устройства и сеансы</h3>
        <SessionSecurityPanel />
      </section>

      <button
        type="button"
        className="btn btn-secondary"
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        onClick={() => void signOutLogged({ callbackUrl: '/' })}
      >
        <LogOut size={16} aria-hidden /> Выйти из учётки
      </button>
    </div>
  );
}
