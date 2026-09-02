'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { X } from 'lucide-react';

type Props = {
  href?: string;
  className?: string;
  title?: string;
  children: ReactNode;
  /** Prefer button semantics when styling matches a CTA pill */
  asButton?: boolean;
};

/**
 * For guests: open a compact prompt with login + register.
 * For signed-in users: navigate to `href` as a normal link.
 */
export default function GuestAuthPrompt({
  href = '/coworking',
  className,
  title,
  children,
  asButton = false,
}: Props) {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const authed = status === 'authenticated';
  const loginHref = `/login?callbackUrl=${encodeURIComponent(href)}`;
  const registerHref = `/register?callbackUrl=${encodeURIComponent(href)}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.body.classList.add('yp-modal-open');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('yp-modal-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (authed) {
    return (
      <Link href={href} className={className} title={title}>
        {children}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className={className}
        title={title}
        aria-busy={status === 'loading' ? true : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </button>

      {open ? (
        <div className="svc-modal is-open yp-guest-prompt" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="yp-guest-prompt__card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="yp-guest-prompt__close"
              aria-label="Закрыть"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
            <p className="yp-guest-prompt__eyebrow">Нужен аккаунт</p>
            <h2 id={titleId} className="yp-guest-prompt__title">
              Войдите, чтобы записаться
            </h2>
            <p className="yp-guest-prompt__lead">
              Запись в коворкинг и на события доступна после входа. Можно сразу создать аккаунт.
            </p>
            <div className="yp-guest-prompt__actions">
              <Link href={loginHref} className="btn btn-primary" onClick={() => setOpen(false)}>
                Войти
              </Link>
              <Link href={registerHref} className="btn btn-secondary" onClick={() => setOpen(false)}>
                Регистрация
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
