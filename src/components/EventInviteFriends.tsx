'use client';

import { CalendarPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

type Friend = { id: string; name: string | null; image?: string | null };

type Props = {
  bookingId: string;
  eventTitle: string;
  compact?: boolean;
  iconOnly?: boolean;
};

/** Invite accepted friends to an afisha event — creates chat card + notification. */
export default function EventInviteFriends({ bookingId, eventTitle, compact, iconOnly }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');

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
        if (!cancelled) toast.error('Не удалось загрузить друзей');
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
    try {
      const res = await fetch('/api/user/bookings/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, friendId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!res.ok) {
        toast.error(data.message || 'Не удалось пригласить');
        return;
      }
      toast.success('Приглашение в чат отправлено');
    } catch {
      toast.error('Сеть недоступна');
    } finally {
      setBusyId('');
    }
  };

  const label = 'Пригласить друзей';

  return (
    <div className={`event-invite-wrap${iconOnly ? ' is-icon-only' : ''}`}>
      <button
        type="button"
        className={
          iconOnly
            ? 'event-action-icon event-invite-icon'
            : `btn btn-secondary event-invite-btn${compact ? ' is-compact' : ''}`
        }
        onClick={() => setOpen((v) => !v)}
        title={iconOnly ? label : undefined}
        aria-label={iconOnly ? label : undefined}
      >
        <CalendarPlus size={iconOnly ? 16 : compact ? 14 : 16} aria-hidden />
        {!iconOnly ? 'Друзьям' : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Пригласить друзей"
          className="event-invite-popover"
        >
          <p style={{ margin: '0 0 0.55rem', fontSize: '0.82rem', color: '#64748b' }}>
            Позвать на «{eventTitle}»
          </p>
          {loading ? <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Загрузка…</p> : null}
          {!loading && friends.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              Пока нет друзей — добавьте в разделе «Друзья».
            </p>
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
        </div>
      ) : null}
    </div>
  );
}
