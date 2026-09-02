'use client';

import { ExternalLink, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import NewsCoverImage from '@/components/NewsCoverImage';
import NewsMediaBadge from '@/components/NewsMediaBadge';
import CatalogPagination from '@/components/CatalogPagination';
import { NEWS_PAGE_SIZE, catalogSlice, totalPages } from '@/lib/pagination';
import { formatRuDate } from '@/lib/format-date';
import type { PublicNewsCard } from '@/lib/public-catalogs';

function excerpt(text: string, max = 220) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

export default function NewsCatalogClient({ items }: { items: PublicNewsCard[] }) {
  const sp = useSafeSearchParams();
  const page = catalogSlice(sp.get('page') || '1', NEWS_PAGE_SIZE).page;
  const { skip, take } = catalogSlice(page, NEWS_PAGE_SIZE);
  const news = useMemo(() => items.slice(skip, skip + take), [items, skip, take]);
  const pages = totalPages(items.length, NEWS_PAGE_SIZE);

  return (
    <div className="container" style={{ padding: '1rem', minHeight: 'auto' }}>
      <h1 className="page-hero-title" style={{ textAlign: 'center' }}>
        Новости
      </h1>
      <p className="page-hero-subtitle" style={{ textAlign: 'center' }}>
        Все самые свежие события и посты из нашей группы ВКонтакте
      </p>

      {news.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
          <p>Новостей пока нет.</p>
        </div>
      ) : (
        <>
          <div className="grid-cards" style={{ margin: '0 auto' }}>
            {news.map((item) => (
              <article key={item.id} className="catalog-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <Link href={`/news/${item.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'contents' }}>
                  <div className="catalog-img-wrap" style={{ position: 'relative' }}>
                    <NewsCoverImage
                      src={item.imageUrl}
                      alt={item.title || 'Новость'}
                      seed={item.id}
                      index={0}
                      className="catalog-img"
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                    <NewsMediaBadge hasVideo={!!item.videoEmbedUrl} />
                  </div>
                  <div
                    className="catalog-card-body"
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}
                  >
                    <span
                      style={{
                        color: 'var(--muted)',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <CalendarDays size={14} />
                      {formatRuDate(item.publishedAt || item.createdAt, {
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {item.title && <h2 className="catalog-card-title-inline">{item.title}</h2>}
                    <p style={{ margin: 0, fontSize: '0.98rem', lineHeight: 1.55, color: 'var(--foreground)' }}>
                      {excerpt(item.text)}
                    </p>
                    <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.92rem' }}>
                      Читать полностью →
                    </span>
                  </div>
                </Link>
                {item.vkLink && (
                  <div style={{ padding: '0 1.25rem 1.15rem' }}>
                    <a
                      href={item.vkLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        color: 'var(--primary)',
                        fontWeight: 600,
                        textDecoration: 'none',
                        background: 'rgba(59,130,246,0.1)',
                        padding: '0.5rem 1rem',
                        borderRadius: '100px',
                        width: 'fit-content',
                        fontSize: '0.88rem',
                      }}
                    >
                      ВКонтакте <ExternalLink size={15} />
                    </a>
                  </div>
                )}
              </article>
            ))}
          </div>
          <CatalogPagination page={page} totalPages={pages} basePath="/news" />
        </>
      )}
    </div>
  );
}
