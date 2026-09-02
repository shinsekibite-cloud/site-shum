import Link from 'next/link';

export type AdminTabItem = {
  href: string;
  label: string;
  count?: number;
  active?: boolean;
  tone?: 'primary' | 'muted' | 'warning' | 'success' | 'danger';
};

const TONES: Record<NonNullable<AdminTabItem['tone']>, { on: string; off: string; onColor: string }> = {
  primary: { on: 'var(--primary)', off: 'transparent', onColor: '#fff' },
  muted: { on: '#475569', off: 'transparent', onColor: '#fff' },
  warning: { on: '#d97706', off: 'transparent', onColor: '#fff' },
  success: { on: '#15803d', off: 'transparent', onColor: '#fff' },
  danger: { on: '#b91c1c', off: 'transparent', onColor: '#fff' },
};

/** Pill tabs for admin list filters (status / type / archive). */
export default function AdminFilterTabs({
  items,
  ariaLabel = 'Фильтры',
}: {
  items: AdminTabItem[];
  ariaLabel?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.45rem',
        marginBottom: '1rem',
        paddingBottom: '0.65rem',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      {items.map((item) => {
        const tone = TONES[item.tone || 'primary'];
        const active = Boolean(item.active);
        return (
          <Link
            key={item.href + item.label}
            href={item.href}
            prefetch
            scroll={false}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: 999,
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '0.85rem',
              background: active ? tone.on : tone.off,
              color: active ? tone.onColor : 'var(--muted)',
              border: active ? '1px solid transparent' : '1px solid #e2e8f0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            aria-current={active ? 'page' : undefined}
          >
            <span>{item.label}</span>
            {typeof item.count === 'number' && item.count > 0 && (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  padding: '0.12rem 0.45rem',
                  borderRadius: 999,
                  background: active ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.06)',
                  color: active ? '#fff' : 'var(--foreground)',
                  minWidth: '1.55rem',
                  height: '1.2rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  lineHeight: 1,
                }}
              >
                {item.count > 999 ? '999+' : item.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
