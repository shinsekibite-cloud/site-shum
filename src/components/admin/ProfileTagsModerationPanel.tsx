'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, Tags, X } from 'lucide-react';
import toast from 'react-hot-toast';

type Item = {
  id: string;
  kind: string;
  tag: string;
  status: string;
  createdAt: string;
  user: { name: string | null; publicCode: string | null; email: string | null };
};

export default function ProfileTagsModerationPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/profile-tags?status=PENDING', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      const r = await fetch('/api/admin/profile-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'Ошибка');
      toast.success(d.message || (action === 'approve' ? 'Одобрено' : 'Отклонено'));
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="glass" style={{ padding: '0.9rem 1rem', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.95rem' }}>
          <Tags size={16} /> Свои варианты (хобби / интересы)
        </strong>
        <button type="button" className="btn btn-secondary" onClick={load} style={{ padding: '0.35rem 0.65rem' }}>
          <RefreshCw size={14} />
        </button>
      </div>
      <p style={{ margin: '0 0 0.65rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
        Пользователь может предложить 1 вариант в сутки. После одобрения тег появится в профиле и в общем списке.
      </p>
      {loading ? (
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>Загрузка…</p>
      ) : items.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>Очередь пуста</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {items.map((it) => (
            <li
              key={it.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
                padding: '0.55rem 0.65rem',
                borderRadius: 10,
                border: '1px solid rgba(15,23,42,0.08)',
                background: '#fff',
              }}
            >
              <span style={{ fontWeight: 750 }}>{it.tag}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                {it.kind === 'interests' ? 'интересы' : 'хобби'} · {it.user.name || it.user.publicCode || 'пользователь'}
              </span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyId === it.id}
                  onClick={() => void act(it.id, 'approve')}
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                >
                  <Check size={14} /> Ок
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busyId === it.id}
                  onClick={() => void act(it.id, 'reject')}
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                >
                  <X size={14} /> Нет
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
