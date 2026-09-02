'use client';

import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Friend = { id: string; name: string | null; image?: string | null };

type Props = {
  placeId: string;
  placeTitle: string;
};

export default function PlaceInviteFriends({ placeId, placeTitle }: Props) {
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
      const res = await fetch('/api/user/places/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId, friendId, message }),
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
      setStatus(`Приглашение отправлено`);
    } catch {
      setStatus('Сеть недоступна');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="places-invite">
      <button
        type="button"
        className="places-cta places-cta--hero"
        onClick={() => setOpen((v) => !v)}
      >
        <UserPlus size={18} />
        Пригласить
      </button>
      {open ? (
        <div className="places-invite__panel" role="dialog" aria-label="Пригласить друзей">
          <p className="places-invite__hint">
            Позвать друга в «{placeTitle}» — приглашение придёт в чат и уведомления
          </p>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={280}
            placeholder="Короткое сообщение (необязательно)"
            className="places-invite__input"
          />
          {loading ? <p className="places-muted">Загрузка друзей…</p> : null}
          {!loading && friends.length === 0 ? (
            <p className="places-muted">Пока нет друзей — добавьте в разделе «Друзья».</p>
          ) : null}
          <ul className="places-invite__list">
            {friends.map((f) => (
              <li key={f.id}>
                <span>{f.name || 'Друг'}</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={Boolean(busyId)}
                  onClick={() => invite(f.id)}
                >
                  {busyId === f.id ? '…' : 'Позвать'}
                </button>
              </li>
            ))}
          </ul>
          {status ? <p className="places-rating__msg">{status}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
