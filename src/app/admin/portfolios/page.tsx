'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import UserAvatar from '@/components/UserAvatar';

type PortfolioDiff = {
  isFirstSubmit: boolean;
  summaryLines: string[];
};

type Item = {
  id: string;
  status: string;
  headline: string | null;
  submittedAt: string | null;
  rejectReason: string | null;
  pendingDiff: PortfolioDiff | null;
  user: { id: string; name: string | null; nickname: string | null; image: string | null; publicCode: string | null };
  _count: { sections: number; certificates: number; achievementLinks: number };
};

export default function AdminPortfoliosPage() {
  const [status, setStatus] = useState('PENDING');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, countsRes] = await Promise.all([
        fetch(`/api/admin/portfolios?status=${encodeURIComponent(status)}`),
        fetch('/api/admin/nav-counts'),
      ]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      setItems(data.items || []);
      if (countsRes.ok) {
        const counts = await countsRes.json();
        const n = counts?.counts?.['/admin/portfolios'] ?? counts?.portfolios ?? 0;
        setPendingCount(typeof n === 'number' ? n : 0);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (id: string, next: 'APPROVED' | 'REJECTED', reason?: string) => {
    const res = await fetch('/api/admin/portfolios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: next, rejectReason: reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Ошибка');
    toast.success(next === 'APPROVED' ? 'Одобрено' : 'Отклонено');
    setRejectId(null);
    setRejectReason('');
    await load();
  };

  const formatCount = (n: number) => (n > 999 ? '999+' : String(n));

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '4rem' }}>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Портфолио</h1>
          <p style={{ color: 'var(--muted)', margin: '0.35rem 0 0' }}>Модерация пользовательских портфолио</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
        {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((s) => {
          const active = status === s;
          const count = s === 'PENDING' ? pendingCount : s === status ? items.length : null;
          return (
            <button
              key={s}
              type="button"
              className="btn"
              onClick={() => setStatus(s)}
              style={{
                padding: '0.45rem 0.8rem',
                background: active ? 'var(--primary)' : '#f8fafc',
                color: active ? '#fff' : '#475569',
                border: '1px solid #e2e8f0',
                borderRadius: 999,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {s === 'PENDING' ? 'На проверке' : s === 'APPROVED' ? 'Одобрено' : s === 'REJECTED' ? 'Отклонено' : 'Все'}
              {count != null && count > 0 ? (
                <span
                  style={{
                    minWidth: '1.55rem',
                    height: '1.2rem',
                    padding: '0 0.4rem',
                    borderRadius: 999,
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: active ? 'rgba(255,255,255,0.22)' : '#fee2e2',
                    color: active ? '#fff' : '#b91c1c',
                    lineHeight: 1,
                    boxSizing: 'border-box',
                  }}
                >
                  {formatCount(count)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Загрузка…</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Нет записей</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '1rem',
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                background: '#fff',
                display: 'grid',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <UserAvatar name={item.user.nickname || item.user.name} image={item.user.image} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{item.user.nickname || item.user.name || 'Пользователь'}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {item.headline || 'Без заголовка'} · разделов {item._count.sections} · грамот{' '}
                    {item._count.certificates}
                    {item.submittedAt
                      ? ` · ${new Date(item.submittedAt).toLocaleString('ru-RU')}`
                      : ''}
                  </div>
                </div>
                <Link href={`/portfolio/${item.user.id}`} className="btn btn-secondary" style={{ padding: '0.4rem 0.7rem' }}>
                  Смотреть
                </Link>
              </div>

              {item.pendingDiff?.summaryLines?.length ? (
                <div
                  style={{
                    padding: '0.75rem 0.85rem',
                    borderRadius: 10,
                    background: item.pendingDiff.isFirstSubmit ? '#f0fdf4' : '#fffbeb',
                    border: `1px solid ${item.pendingDiff.isFirstSubmit ? '#bbf7d0' : '#fde68a'}`,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      marginBottom: 6,
                      color: item.pendingDiff.isFirstSubmit ? '#166534' : '#92400e',
                    }}
                  >
                    {item.pendingDiff.isFirstSubmit ? 'Первая отправка' : 'Что изменилось'}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem', color: '#334155', lineHeight: 1.45 }}>
                    {item.pendingDiff.summaryLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {item.status === 'PENDING' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '0.45rem 0.85rem' }}
                    onClick={() => void review(item.id, 'APPROVED').catch((e) => toast.error(e.message))}
                  >
                    Одобрить
                  </button>
                  {rejectId === item.id ? (
                    <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 6 }}>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={2}
                        placeholder="Причина отказа"
                        style={{ width: '100%', padding: '0.5rem', borderRadius: 8, border: '1px solid #fecaca' }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.65rem', background: '#b91c1c', color: '#fff' }}
                          onClick={() =>
                            void review(item.id, 'REJECTED', rejectReason.trim() || 'Отклонено').catch((e) =>
                              toast.error(e.message)
                            )
                          }
                        >
                          Отклонить
                        </button>
                        <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem' }} onClick={() => setRejectId(null)}>
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.45rem 0.85rem', color: '#991b1b', background: '#fee2e2' }}
                      onClick={() => setRejectId(item.id)}
                    >
                      Отклонить
                    </button>
                  )}
                </div>
              ) : null}
              {item.rejectReason ? (
                <div style={{ fontSize: '0.85rem', color: '#991b1b' }}>Причина: {item.rejectReason}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
