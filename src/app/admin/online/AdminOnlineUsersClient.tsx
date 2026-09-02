'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, RefreshCw, Search, Users } from 'lucide-react';

type Item = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  lastActiveAt: string | null;
  online: boolean;
  idleSec: number | null;
  loadScore: number;
  city: string | null;
  activity: { loginEvents: number; actionLogs: number; bookings: number; applications: number };
};

export default function AdminOnlineUsersClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState({ onlineCount: 0, recentCount: 0, totalUsers: 0 });
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('online');
  const [sort, setSort] = useState('active');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [busy, setBusy] = useState(false);
  const [collectedAt, setCollectedAt] = useState('');

  const qs = useMemo(() => {
    const p = new URLSearchParams({
      status,
      sort,
      order,
      limit: '80',
    });
    if (q.trim()) p.set('q', q.trim());
    if (role) p.set('role', role);
    return p.toString();
  }, [q, role, status, sort, order]);

  const load = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/online-users?${qs}`, { cache: 'no-store' });
      const d = await r.json();
      setItems(d.items || []);
      setSummary(d.summary || { onlineCount: 0, recentCount: 0, totalUsers: 0 });
      setCollectedAt(d.collectedAt || '');
    } finally {
      setBusy(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 90_000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={22} /> Пользователи онлайн
          </h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
            Окно online ≈ 5 мин (heartbeat). Нагрузка = логи + действия + брони/заявки. Обновление каждые 90 с.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={14} /> Обновить
          </button>
          <a className="btn btn-primary btn-sm" href={`/api/admin/online-users/pdf?${qs}`}>
            <Download size={14} /> PDF-отчёт
          </a>
          <Link className="btn btn-ghost btn-sm" href="/admin/system">
            Нагрузка сервера
          </Link>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
        }}
      >
        {[
          { label: 'Онлайн', value: summary.onlineCount },
          { label: 'За 24 часа', value: summary.recentCount },
          { label: 'Всего', value: summary.totalUsers },
        ].map((c) => (
          <div
            key={c.label}
            style={{
              padding: '0.75rem 0.9rem',
              borderRadius: 12,
              border: '1px solid rgba(15,23,42,0.08)',
              background: '#fff',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{c.label}</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 750 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 200px' }}>
          <Search size={16} />
          <input
            className="settings-input"
            style={{ flex: 1 }}
            placeholder="Поиск…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="settings-input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 140 }}>
          <option value="online">Онлайн</option>
          <option value="recent">За 24ч</option>
          <option value="all">Все</option>
        </select>
        <select className="settings-input" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 140 }}>
          <option value="">Все роли</option>
          {['USER', 'PARTICIPANT', 'MODERATOR', 'ADMIN', 'SCANNER', 'TECH'].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select className="settings-input" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 150 }}>
          <option value="active">По активности</option>
          <option value="load">По нагрузке</option>
          <option value="name">По имени</option>
          <option value="role">По роли</option>
        </select>
        <select
          className="settings-input"
          value={order}
          onChange={(e) => setOrder(e.target.value as 'asc' | 'desc')}
          style={{ width: 120 }}
        >
          <option value="desc">Убыв.</option>
          <option value="asc">Возр.</option>
        </select>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid rgba(15,23,42,0.08)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: '0.65rem 0.75rem' }}>Пользователь</th>
              <th style={{ padding: '0.65rem 0.75rem' }}>Роль</th>
              <th style={{ padding: '0.65rem 0.75rem' }}>Статус</th>
              <th style={{ padding: '0.65rem 0.75rem' }}>Нагрузка</th>
              <th style={{ padding: '0.65rem 0.75rem' }}>Активность</th>
              <th style={{ padding: '0.65rem 0.75rem' }}>Последний визит</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid rgba(15,23,42,0.06)' }}>
                <td style={{ padding: '0.6rem 0.75rem' }}>
                  <Link href={`/admin/users/${u.id}`} style={{ fontWeight: 650 }}>
                    {u.name || u.email}
                  </Link>
                  <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{u.email}</div>
                </td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{u.role}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>
                  <span style={{ color: u.online ? '#0f766e' : '#64748b', fontWeight: 650 }}>
                    {u.online ? 'online' : 'offline'}
                  </span>
                </td>
                <td style={{ padding: '0.6rem 0.75rem', fontWeight: 700 }}>{u.loadScore}</td>
                <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                  logins {u.activity.loginEvents} · actions {u.activity.actionLogs} · book {u.activity.bookings} · app{' '}
                  {u.activity.applications}
                </td>
                <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                  {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString('ru-RU') : '—'}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '1rem', color: 'var(--muted)' }}>
                  Нет пользователей по фильтру.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {collectedAt ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Обновлено: {new Date(collectedAt).toLocaleString('ru-RU')}</div>
      ) : null}
    </div>
  );
}
