'use client';

import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Friend = { id: string; name: string | null; image?: string | null };

type Props = {
  kind: 'PROJECT' | 'CLUB';
  entityId: string;
  entityTitle: string;
};

export default function EntityInviteFriends({ kind, entityId, entityTitle }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/friends');
        if (res.status === 401) {
          router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          setFriends(Array.isArray(data.friends) ? data.friends : []);
        }
      } catch {
        if (!cancelled) setStatus('Не удалось загрузить друзей');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, router]);

  const invite = async (friendId: string) => {
    if (busyId) return;
    setBusyId(friendId);
    setStatus('');
    try {
      const res = await fetch('/api/entity-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, entityId, friendId, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!res.ok) {
        setStatus(data.message || 'Не удалось пригласить');
        return;
      }
      setStatus('Приглашение отправлено');
    } catch {
      setStatus('Сеть недоступна');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        onClick={() => setOpen((v) => !v)}
      >
        <UserPlus size={18} />
        Пригласить друзей
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Пригласить друзей"
          style={{
            marginTop: 10,
            padding: '0.85rem',
            borderRadius: 12,
            border: '1px solid rgba(15,23,42,0.08)',
            background: 'rgba(15,23,42,0.02)',
          }}
        >
          <p style={{ margin: '0 0 0.55rem', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.45 }}>
            Позвать друга в «{entityTitle}» — приглашение придёт в уведомления
          </p>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={280}
            placeholder="Короткое сообщение (необязательно)"
            style={{
              width: '100%',
              padding: '0.55rem 0.65rem',
              borderRadius: 8,
              border: '1px solid rgba(15,23,42,0.12)',
              fontSize: '0.88rem',
              marginBottom: 8,
            }}
          />
          {loading ? <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Загрузка друзей…</p> : null}
          {!loading && friends.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Пока нет друзей — добавьте в разделе «Друзья».</p>
          ) : null}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, maxHeight: 200, overflow: 'auto' }}>
            {friends.map((f) => (
              <li key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{f.name || 'Друг'}</span>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0.28rem 0.55rem', fontSize: '0.75rem' }}
                  disabled={Boolean(busyId)}
                  onClick={() => void invite(f.id)}
                >
                  {busyId === f.id ? '…' : 'Позвать'}
                </button>
              </li>
            ))}
          </ul>
          {status ? (
            <p style={{ margin: '0.55rem 0 0', fontSize: '0.82rem', color: status.includes('отправлено') ? '#15803d' : '#b91c1c' }}>
              {status}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
