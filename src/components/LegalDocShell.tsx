import type { ReactNode } from 'react';
import Link from 'next/link';
import { sanitizeCmsHtml } from '@/lib/sanitize-html';

export type LegalTocItem = { id: string; title: string };

/** Pull h2 titles and inject stable ids for in-page navigation. */
export function prepareLegalHtml(html: string): { html: string; toc: LegalTocItem[] } {
  const clean = sanitizeCmsHtml(html);
  const toc: LegalTocItem[] = [];
  let i = 0;
  const next = clean.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi, (_full, attrs = '', inner) => {
    i += 1;
    const id = `s-${i}`;
    const title = String(inner)
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
    if (title) toc.push({ id, title });
    const cleanAttrs = String(attrs || '').replace(/\s*id\s*=\s*["'][^"']*["']/i, '');
    return `<h2 id="${id}"${cleanAttrs}>${inner}</h2>`;
  });
  return { html: next, toc };
}

export default function LegalDocShell({
  brand: _brand,
  icon,
  title,
  lead,
  meta,
  toc = [],
  children,
  aside,
}: {
  brand?: string;
  icon: ReactNode;
  title: string;
  lead: ReactNode;
  meta?: ReactNode;
  toc?: LegalTocItem[];
  children: ReactNode;
  aside?: ReactNode;
}) {
  void _brand;
  const hasToc = toc.length > 1;

  return (
    <div className="legal-page">
      <div className="legal-page-bg" aria-hidden />
      <div className="container legal-page-inner">
        <header className="legal-hero">
          <div className="legal-hero-heading">
            <div className="legal-hero-icon">{icon}</div>
            <h1 className="legal-title">{title}</h1>
          </div>
          <div className="legal-lead">{lead}</div>
          {meta ? <div className="legal-meta">{meta}</div> : null}
        </header>

        <div className={hasToc ? 'legal-layout legal-layout--toc' : 'legal-layout'}>
          {hasToc ? (
            <nav className="legal-toc" aria-label="Разделы документа">
              <div className="legal-toc-label">По разделам</div>
              <div className="legal-toc-track">
                {toc.map((item) => (
                  <a key={item.id} href={`#${item.id}`} className="legal-toc-chip">
                    {item.title.replace(/^\d+\.\s*/, '')}
                  </a>
                ))}
              </div>
            </nav>
          ) : null}

          <div className="legal-main">
            <article className="legal-article">{children}</article>
            {aside ? <aside className="legal-aside">{aside}</aside> : null}
          </div>
        </div>

        <p className="legal-foot-link">
          <Link href="/">На главную</Link>
          <span aria-hidden>·</span>
          <Link href="/contacts">Контакты</Link>
          <span aria-hidden>·</span>
          <Link href="/rules">Правила сайта</Link>
        </p>
      </div>
    </div>
  );
}
