'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, MessageCircle, Search, UserPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import UserAvatar from '@/components/UserAvatar';

type Trust = {
  score: number;
  label: string;
  sharedEvents: number;
  messages: number;
  friendDays: number;
};

type Person = {
  friendshipId: string;
  id: string;
  name: string | null;
  image: string | null;
  createdAt?: string;
  trust?: Trust;
  aliased?: boolean;
  presence?: { online: boolean; label: string } | null;
};

type SearchHit = {
  id: string;
  name: string | null;
  image: string | null;
  city: string | null;
  aliased?: boolean;
  friendship: {
    friendshipId: string;
    status: string;
    direction: 'incoming' | 'outgoing';
  } | null;
};

type FriendsData = {
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
};

const emptyData: FriendsData = { friends: [], incoming: [], outgoing: [] };
const actionStyle = {
  border: 0,
  borderRadius: 10,
  padding: '0.55rem 0.75rem',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
} as const;

function Avatar({
  person,
  size = 44,
}: {
  person: {
    name: string | null;
    image: string | null;
    aliased?: boolean;
    presence?: { online: boolean; label: string } | null;
  };
  size?: number;
}) {
  return (
    <UserAvatar
      name={person.name}
      image={person.image}
      size={size}
      aliased={person.aliased}
      online={person.presence?.online ?? null}
      showStatus={person.presence != null}
    />
  );
}

export default function FriendsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<FriendsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [siteQuery, setSiteQuery] = useState('');
  const [siteResults, setSiteResults] = useState<SearchHit[]>([]);
  const [siteSearching, setSiteSearching] = useState(false);
  const [siteSearched, setSiteSearched] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/friends');
    if (!response.ok) throw new Error('Не удалось загрузить друзей');
    setData(await response.json());
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login?callbackUrl=' + encodeURIComponent('/friends'));
      return;
    }
    if (status === 'authenticated') {
      let cancelled = false;
      const initialize = async () => {
        try {
          const response = await fetch('/api/friends');
          if (!response.ok) throw new Error('Не удалось загрузить друзей');
          const result = await response.json();
          if (!cancelled) setData(result);
        } catch (error) {
          if (!cancelled) {
            toast.error(error instanceof Error ? error.message : 'Ошибка');
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      };
      initialize();
      return () => {
        cancelled = true;
      };
    }
  }, [load, router, status]);

  useEffect(() => {
    const needle = siteQuery.trim();
    if (needle.length < 2) {
      setSiteResults([]);
      setSiteSearched(false);
      setSiteSearching(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSiteSearching(true);
      try {
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(needle)}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Ошибка поиска');
        if (!cancelled) {
          setSiteResults(Array.isArray(result.users) ? result.users : []);
          setSiteSearched(true);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Ошибка поиска');
          setSiteResults([]);
          setSiteSearched(true);
        }
      } finally {
        if (!cancelled) setSiteSearching(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [siteQuery]);

  const act = async (friendshipId: string, action: 'accept' | 'decline' | 'cancel' | 'remove') => {
    setBusyId(friendshipId);
    try {
      const response = await fetch('/api/friends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Не удалось выполнить действие');
      await load();
      toast.success(action === 'accept' ? 'Заявка принята' : 'Готово');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка');
    } finally {
      setBusyId(null);
    }
  };

  const sendRequest = async (userId: string) => {
    setBusyId(userId);
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Не удалось отправить заявку');
      await load();
      setSiteResults((prev) =>
        prev.map((hit) =>
          hit.id === userId
            ? {
                ...hit,
                friendship: {
                  friendshipId: result.friendship?.id || '',
                  status: 'PENDING',
                  direction: 'outgoing',
                },
              }
            : hit
        )
      );
      toast.success('Заявка отправлена');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка');
    } finally {
      setBusyId(null);
    }
  };

  const friends = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    if (!needle) return data.friends;
    return data.friends.filter((friend) =>
      (friend.name || '').toLocaleLowerCase('ru').includes(needle)
    );
  }, [data.friends, query]);

  if (status === 'loading' || loading) {
    return (
      <main className="container friends-page" style={{ padding: '1.25rem 1rem 2rem' }}>
        <div className="svc-skel" aria-busy="true" aria-label="Загрузка">
          <div className="svc-skel__pill" />
          <div className="svc-skel__row" />
          <div className="svc-skel__row" />
        </div>
      </main>
    );
  }

  return (
    <main className="container friends-page" style={{ padding: '1.25rem 1rem 2rem' }}>
      <div className="messages-top" style={{ marginBottom: '1rem' }}>
        <Link href="/dashboard" className="messages-top__back" aria-label="Назад в профиль">
          <ArrowLeft size={20} />
        </Link>
        <div className="messages-top__copy">
          <h1>Друзья</h1>
          <p>
            Ищите участников по имени и отправляйте заявки. Закрытые профили в поиске не показываются.
          </p>
        </div>
        <Link href="/messages" className="messages-top__friends">
          <MessageCircle size={16} aria-hidden />
          Сообщения
        </Link>
      </div>

      <section className="glass" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.75rem' }}>Поиск по сайту</h2>
        <label style={{ position: 'relative', display: 'block' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
          <input
            value={siteQuery}
            onChange={(event) => setSiteQuery(event.target.value)}
            placeholder="Имя участника (от 2 символов)"
            aria-label="Поиск друзей по сайту"
            style={{
              width: '100%',
              padding: '0.65rem 0.8rem 0.65rem 2.2rem',
              border: '1px solid rgba(15,23,42,.12)',
              borderRadius: 12,
              background: '#fff',
              fontSize: '1rem',
            }}
          />
        </label>
        {siteSearching && (
          <p style={{ margin: '0.75rem 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>Ищем…</p>
        )}
        {!siteSearching && siteSearched && siteResults.length === 0 && (
          <p style={{ margin: '0.75rem 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
            Никого не найдено. Закрытые профили скрыты из поиска.
          </p>
        )}
        {siteResults.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {siteResults.map((hit) => (
              <div
                key={hit.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0.5rem',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,.55)',
                  minWidth: 0,
                }}
              >
                <Avatar person={hit} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/u/${hit.id}`} style={{ color: 'var(--foreground)', fontWeight: 750 }}>
                    {hit.name || 'Пользователь'}
                  </Link>
                  {hit.aliased && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
                      Сказочный псевдоним
                    </div>
                  )}
                  {hit.city && (
                    <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 2 }}>{hit.city}</div>
                  )}
                </div>
                {!hit.friendship && (
                  <button
                    type="button"
                    disabled={busyId === hit.id}
                    onClick={() => sendRequest(hit.id)}
                    style={{ ...actionStyle, background: '#2563eb', color: '#fff' }}
                  >
                    <UserPlus size={16} />
                    <span className="desktop-only">Добавить</span>
                  </button>
                )}
                {hit.friendship?.status === 'PENDING' && hit.friendship.direction === 'outgoing' && (
                  <span style={{ ...actionStyle, background: '#eef2f7', color: '#64748b', cursor: 'default' }}>
                    Отправлено
                  </span>
                )}
                {hit.friendship?.status === 'PENDING' && hit.friendship.direction === 'incoming' && (
                  <Link href="/friends" style={{ ...actionStyle, background: '#16a34a', color: '#fff' }}>
                    Ответить
                  </Link>
                )}
                {hit.friendship?.status === 'ACCEPTED' && (
                  <Link
                    href={`/messages?with=${hit.id}`}
                    style={{ ...actionStyle, background: '#2563eb', color: '#fff' }}
                  >
                    <MessageCircle size={16} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {data.incoming.length > 0 && (
        <section className="glass" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.75rem' }}>
            Входящие заявки · {data.incoming.length}
          </h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {data.incoming.map((person) => (
              <div
                key={person.friendshipId}
                style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}
              >
                <Avatar person={person} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href={`/u/${person.id}`}
                    style={{ color: 'var(--foreground)', fontWeight: 750 }}
                  >
                    {person.name || 'Пользователь'}
                  </Link>
                  {person.aliased && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
                      Сказочный псевдоним
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busyId === person.friendshipId}
                  onClick={() => act(person.friendshipId, 'accept')}
                  style={{ ...actionStyle, background: '#16a34a', color: '#fff' }}
                  aria-label="Принять заявку"
                >
                  <Check size={16} /> <span className="desktop-only">Принять</span>
                </button>
                <button
                  type="button"
                  disabled={busyId === person.friendshipId}
                  onClick={() => act(person.friendshipId, 'decline')}
                  style={{ ...actionStyle, background: '#f1f5f9', color: '#475569' }}
                  aria-label="Отклонить заявку"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.outgoing.length > 0 && (
        <section className="glass" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.75rem' }}>
            Отправленные · {data.outgoing.length}
          </h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {data.outgoing.map((person) => (
              <div key={person.friendshipId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar person={person} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/u/${person.id}`} style={{ color: 'var(--foreground)', fontWeight: 700 }}>
                    {person.name || 'Пользователь'}
                  </Link>
                  {person.aliased && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
                      Сказочный псевдоним
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busyId === person.friendshipId}
                  onClick={() => act(person.friendshipId, 'cancel')}
                  style={{ ...actionStyle, background: '#f1f5f9', color: '#475569' }}
                >
                  Отменить
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="glass" style={{ padding: '1rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: '0.8rem',
          }}
        >
          <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Мои друзья · {data.friends.length}</h2>
          <label style={{ position: 'relative', display: 'block', flex: '1 1 190px', maxWidth: 280 }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Фильтр среди друзей"
              style={{
                width: '100%',
                padding: '0.55rem 0.7rem 0.55rem 2rem',
                border: '1px solid rgba(15,23,42,.12)',
                borderRadius: 10,
                background: '#fff',
              }}
            />
          </label>
        </div>

        {friends.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem 1rem' }}>
            <UserPlus size={28} style={{ marginBottom: 6 }} />
            <div>{query ? 'Никого не найдено' : 'Список друзей пока пуст'}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {friends.map((friend) => (
              <div
                key={friend.friendshipId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0.5rem',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,.55)',
                }}
              >
                <Avatar person={friend} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/u/${friend.id}`} style={{ color: 'var(--foreground)', fontWeight: 750 }}>
                    {friend.name || 'Пользователь'}
                  </Link>
                  <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 2 }}>
                    {friend.presence ? (
                      <span style={{ color: friend.presence.online ? '#16a34a' : undefined }}>
                        {friend.presence.label}
                      </span>
                    ) : null}
                    {friend.presence && friend.trust ? ' · ' : null}
                    {friend.trust ? (
                      <span>
                        {friend.trust.label} · {friend.trust.score}%
                      </span>
                    ) : null}
                  </div>
                </div>
                <Link
                  href={`/messages?with=${friend.id}`}
                  style={{ ...actionStyle, background: '#2563eb', color: '#fff' }}
                  aria-label={`Написать ${friend.name || 'другу'}`}
                >
                  <MessageCircle size={16} />
                  <span className="desktop-only">Написать</span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
