import Link from 'next/link';

export type Crumb = { href?: string; label: string };

/** Compact SEO-friendly breadcrumb trail with JSON-LD. */
export default function Breadcrumbs({ items, className = '' }: { items: Crumb[]; className?: string }) {
  if (!items.length) return null;
  const origin = process.env.NEXTAUTH_URL || 'https://py.idivles.ru';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.label,
      ...(it.href ? { item: `${origin.replace(/\/$/, '')}${it.href}` } : {}),
    })),
  };
  return (
    <nav className={`yp-breadcrumbs${className ? ` ${className}` : ''}`} aria-label="Навигация">
      <ol>
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`}>
            {it.href && i < items.length - 1 ? <Link href={it.href}>{it.label}</Link> : <span>{it.label}</span>}
            {i < items.length - 1 ? <span className="yp-breadcrumbs__sep" aria-hidden>/</span> : null}
          </li>
        ))}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </nav>
  );
}
