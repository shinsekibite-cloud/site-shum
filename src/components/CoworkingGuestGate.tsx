'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  callbackPath?: string;
};

/** Soft gate on /coworking — block guests and pending moderation until session is ready. */
export default function CoworkingGuestGate({ children, callbackPath = '/coworking' }: Props) {
  const { data: session, status } = useSession();
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;
  const registerHref = `/register?callbackUrl=${encodeURIComponent(callbackPath)}`;

  if (status === 'loading') {
    return (
      <div className="yp-surface yp-guest-gate cw-guest-gate cw-guest-gate--static" role="status">
        <h2>Проверяем вход…</h2>
        <p>Секунду — откроем запись, если вы уже вошли.</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="cw-guest-wrap">
        <div className="cw-guest-wrap__dim" aria-hidden>
          {children}
        </div>
        <div className="yp-surface yp-guest-gate cw-guest-gate" role="region" aria-label="Требуется вход">
          <h2>Войдите, чтобы записаться</h2>
          <p>Площадка, день и интервал сохранятся после входа — продолжите с того же шага.</p>
          <div className="cw-guest-gate__actions">
            <Link href={loginHref} className="btn btn-primary">
              Войти
            </Link>
            <Link href={registerHref} className="btn btn-secondary">
              Регистрация
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (session?.user?.moderationPending) {
    return (
      <div className="yp-surface yp-guest-gate cw-guest-gate cw-guest-gate--static" role="region">
        <h2>Аккаунт на проверке</h2>
        <p>
          Запись будет доступна после одобрения администратором или автоматически в рабочие часы. Пока можно
          смотреть профиль и сайт.
        </p>
        <div className="cw-guest-gate__actions">
          <Link href="/dashboard" className="btn btn-primary">
            В кабинет
          </Link>
          <Link href="/spaces" className="btn btn-secondary">
            К площадкам
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
