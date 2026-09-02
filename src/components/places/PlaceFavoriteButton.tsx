'use client';

import { Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = {
  placeId: string;
  initialFavorited?: boolean;
  initialCount?: number;
  /** Visual variant for hero CTA */
  variant?: 'hero' | 'inline';
};

export default function PlaceFavoriteButton({
  placeId,
  initialFavorited = false,
  initialCount = 0,
  variant = 'hero',
}: Props) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/user/places/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!res.ok) {
        setError(data.message || 'Не удалось обновить');
        return;
      }
      setFavorited(Boolean(data.favorited));
      setCount(Number(data.favoritesCount) || 0);
      router.refresh();
    } catch {
      setError('Сеть недоступна');
    } finally {
      setBusy(false);
    }
  };

  const hero = variant === 'hero';

  return (
    <div className="places-cta-wrap">
      <button
        type="button"
        className={`places-cta ${hero ? 'places-cta--hero' : ''} ${favorited ? 'is-on' : ''}`}
        onClick={toggle}
        disabled={busy}
        aria-pressed={favorited}
      >
        <Heart size={18} fill={favorited ? 'currentColor' : 'none'} />
        {favorited ? 'В избранном' : 'В избранное'}
        {count > 0 ? <span className="places-cta__count">{count}</span> : null}
      </button>
      {error ? <p className="places-inline-error">{error}</p> : null}
    </div>
  );
}
