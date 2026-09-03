'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Search, Trash2 } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

type Item = {
  id: string;
  roleTitle: string;
  sortOrder: number;
  isVisible: boolean;
  user: {
    id: string;
    name: string | null;
    nickname: string | null;
    image: string | null;
    publicCode: string | null;
    city: string | null;
  };
};

type Hit = {
  id: string;
  name: string | null;
  image: string | null;
  city: string | null;
};

export default function AdminAboutTeamPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [roleTitle, setRoleTitle] = useState('Участник команды');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/about-team');
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Ошибка');
    setItems(data.items || []);
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e instanceof Error ? e.message : 'Ошибка'));
  }, [load]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/about-team?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((d) => setHits(d.users || []))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const addUser = async (userId: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/about-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, roleTitle: roleTitle.trim() || 'Участник команды' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      toast.success('Добавлено');
      setQ('');
      setHits([]);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '4rem' }}>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Команда на «О нас»</h1>
          <p style={{ color: 'var(--muted)', margin: '0.35rem 0 0' }}>
            Выберите профили пользователей, которые появятся в блоке команды на странице{' '}
            <Link href="/p/about">/p/about</Link>
          </p>
        </div>
      </div>

      <div className="card-surface" style={{ padding: '1.1rem', marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontWeight: 650, marginBottom: 6, fontSize: '0.85rem' }}>Роль / должность</label>
        <input
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
          style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 12 }}
        />
        <label style={{ display: 'block', fontWeight: 650, marginBottom: 6, fontSize: '0.85rem' }}>Поиск пользователя</label>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 14, color: '#94a3b8' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Имя или никнейм"
            style={{ width: '100%', padding: '0.7rem 0.8rem 0.7rem 2.2rem', borderRadius: 10, border: '1px solid #e2e8f0' }}
          />
        </div>
        {hits.length > 0 && (
          <div style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            {hits.slice(0, 8).map((h) => (
              <button
                key={h.id}
                type="button"
                disabled={busy}
                onClick={() => void addUser(h.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: '0.65rem 0.8rem',
                  border: 0,
                  borderBottom: '1px solid #f1f5f9',
                  background: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <UserAvatar name={h.name} image={h.image} size={36} />
                <span>
                  <strong style={{ display: 'block' }}>{h.name || 'Пользователь'}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{h.city || 'Добавить в команду'}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {items.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Пока никого не выбрали</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: '0.75rem',
                borderRadius: 12,
                background: '#fff',
                border: '1px solid #e2e8f0',
              }}
            >
              <UserAvatar name={item.user.nickname || item.user.name} image={item.user.image} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{item.user.nickname || item.user.name || 'Пользователь'}</strong>
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{item.roleTitle}</div>
              </div>
              <Link href={`/u/${item.user.publicCode || item.user.id}`} className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem' }}>
                Профиль
              </Link>
              <button
                type="button"
                aria-label="Удалить"
                onClick={async () => {
                  await fetch(`/api/admin/about-team?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
                  await load();
                }}
                style={{ border: 0, background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
