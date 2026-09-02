import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="error-page">
      <FileQuestion size={64} className="error-page__icon" style={{ color: 'var(--muted)' }} aria-hidden />
      <h1 className="error-page__title">Страница не найдена</h1>
      <p className="error-page__text">
        Извините, но страница, которую вы ищете, не существует или была удалена.
      </p>
      <Link href="/" className="btn btn-primary">
        Вернуться на главную
      </Link>
    </div>
  );
}
