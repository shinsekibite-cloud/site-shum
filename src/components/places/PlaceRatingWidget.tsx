'use client';

import { Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = {
  placeId: string;
  initialScore?: number | null;
  ratingAvg?: number;
  ratingCount?: number;
};

export default function PlaceRatingWidget({
  placeId,
  initialScore = null,
  ratingAvg = 0,
  ratingCount = 0,
}: Props) {
  const router = useRouter();
  const [myScore, setMyScore] = useState<number | null>(initialScore);
  const [avg, setAvg] = useState(ratingAvg);
  const [count, setCount] = useState(ratingCount);
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const rate = async (score: number) => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/user/places/rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId, score }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!res.ok) {
        setMsg(data.message || 'Не удалось сохранить');
        return;
      }
      setMyScore(score);
      setAvg(Number(data.ratingAvg) || 0);
      setCount(Number(data.ratingCount) || 0);
      setMsg('Оценка сохранена');
      router.refresh();
    } catch {
      setMsg('Сеть недоступна');
    } finally {
      setBusy(false);
    }
  };

  const active = hover || myScore || 0;

  return (
    <div className="places-rating">
      <div className="places-rating__summary">
        <strong>{count > 0 ? avg.toFixed(1) : '—'}</strong>
        <span>{count > 0 ? `${count} оценок` : 'Пока нет оценок'}</span>
      </div>
      <div className="places-rating__stars" role="group" aria-label="Оценить место">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`places-rating__star ${n <= active ? 'is-on' : ''}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => rate(n)}
            disabled={busy}
            aria-label={`${n} из 5`}
          >
            <Star size={22} fill={n <= active ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
      {myScore ? <p className="places-rating__mine">Ваша оценка: {myScore}</p> : null}
      {msg ? <p className="places-rating__msg">{msg}</p> : null}
    </div>
  );
}
