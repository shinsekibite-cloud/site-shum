'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = {
  placeId: string;
  hasPending?: boolean;
};

export default function PlaceReviewForm({ placeId, hasPending = false }: Props) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(hasPending);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/user/places/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!res.ok) {
        setError(data.message || 'Не удалось отправить');
        return;
      }
      setOk(true);
      setBody('');
      router.refresh();
    } catch {
      setError('Сеть недоступна');
    } finally {
      setBusy(false);
    }
  };

  if (ok) {
    return (
      <div className="places-review-pending">
        Ваш отзыв на модерации. После одобрения он появится на странице.
      </div>
    );
  }

  return (
    <form className="places-review-form" onSubmit={submit}>
      <label htmlFor={`place-review-${placeId}`}>Ваш отзыв</label>
      <textarea
        id={`place-review-${placeId}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="Поделитесь впечатлением: как добраться, что взять с собой, лучшее время…"
        required
        minLength={10}
      />
      <div className="places-review-form__row">
        <span>{body.length}/2000</span>
        <button type="submit" className="btn btn-primary" disabled={busy || body.trim().length < 10}>
          {busy ? 'Отправка…' : 'Отправить отзыв'}
        </button>
      </div>
      {error ? <p className="places-inline-error">{error}</p> : null}
    </form>
  );
}
