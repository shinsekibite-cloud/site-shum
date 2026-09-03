'use client';

import Link from 'next/link';

type Props = {
  callbackPath: string;
  title?: string;
  lead?: string;
  className?: string;
};

/** Full-page soft auth gate (friends / messages / etc.) — no hard redirect. */
export default function AccountSoftGate({
  callbackPath,
  title = 'Войдите, чтобы продолжить',
  lead = 'Раздел доступен после входа. Можно сразу создать аккаунт — вернётесь на эту страницу.',
  className,
}: Props) {
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;
  const registerHref = `/register?callbackUrl=${encodeURIComponent(callbackPath)}`;

  return (
    <div className={`yp-surface yp-guest-gate${className ? ` ${className}` : ''}`} role="region" aria-label="Требуется вход">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ color: 'var(--muted)' }}>{lead}</p>
      <div className="cw-guest-gate__actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
        <Link href={loginHref} className="btn btn-primary">
          Войти
        </Link>
        <Link href={registerHref} className="btn btn-secondary">
          Регистрация
        </Link>
      </div>
    </div>
  );
}
