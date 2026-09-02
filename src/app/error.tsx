'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="error-page">
      <AlertTriangle size={64} className="error-page__icon" style={{ color: 'var(--accent)' }} aria-hidden />
      <h1 className="error-page__title">Упс! Что-то пошло не так</h1>
      <p className="error-page__text">
        Произошла непредвиденная ошибка на сервере. Мы уже работаем над её устранением.
      </p>
      <div className="error-page__actions">
        <button type="button" onClick={() => reset()} className="btn btn-primary">
          Попробовать снова
        </button>
        <Link href="/" className="btn btn-secondary">
          На главную
        </Link>
      </div>
    </div>
  );
}
