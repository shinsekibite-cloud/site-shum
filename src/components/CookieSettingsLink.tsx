'use client';

import { openCookieSettings } from '@/lib/cookie-consent';

export default function CookieSettingsLink({
  className,
  style,
  children = 'Настройки cookie',
}: {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className || 'yp-cookie-settings-link'}
      onClick={() => openCookieSettings()}
      style={
        style || {
          appearance: 'none',
          border: 0,
          background: 'none',
          padding: 0,
          margin: 0,
          color: 'var(--muted)',
          font: 'inherit',
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        }
      }
    >
      {children}
    </button>
  );
}
