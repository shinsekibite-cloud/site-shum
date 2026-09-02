import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, ExternalLink } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { publishedWhere } from '@/lib/publish';
import { newsCoverUrl } from '@/lib/news-media';
import NewsCoverImage from '@/components/NewsCoverImage';
import NewsVideoEmbed from '@/components/NewsVideoEmbed';
import type { Metadata } from 'next';
import { decodeRouteParam, encodeRouteParam } from '@/lib/route-id';
import ViewBeacon from '@/components/ViewBeacon';
import { formatRuDate } from '@/lib/format-date';
import Breadcrumbs from '@/components/Breadcrumbs';
import RelatedLinks from '@/components/RelatedLinks';
import { staticNewsParams } from '@/lib/generate-public-static-params';

export const revalidate = 60;
export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  return staticNewsParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = decodeRouteParam(rawId);
  const item = await prisma.news.findFirst({
    where: { id, ...publishedWhere() },
    select: { title: true, text: true, imageUrl: true, videoEmbedUrl: true },
  });
  if (!item) return { title: 'Новость не найдена' };
  const { withSiteBrand, getSiteIdentity } = await import('@/lib/site-identity');
  const { siteName } = await getSiteIdentity();
  const title = item.title || (item.videoEmbedUrl ? 'Видео' : 'Новость');
  const description = item.text.replace(/\s+/g, ' ').slice(0, 160);
  return {
    title: withSiteBrand(title, siteName),
    description,
    openGraph: {
      title,
      description,
      images: item.imageUrl ? [newsCoverUrl(item.imageUrl)] : [],
    },
  };
}

export default async function NewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeRouteParam(rawId);
  const item = await prisma.news.findFirst({
    where: { id, ...publishedWhere() },
  });
  if (!item) notFound();

  const when = item.publishedAt || item.createdAt;

  const related = await prisma.news.findMany({
    where: { id: { not: item.id }, ...publishedWhere() },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: 4,
    select: { id: true, title: true, publishedAt: true, createdAt: true },
  });

  return (
    <div className="container" style={{ padding: '1.5rem 1rem 3rem' }}>
      <Breadcrumbs
        items={[
          { href: '/', label: 'Главная' },
          { href: '/news', label: 'Новости' },
          { label: item.title || 'Новость' },
        ]}
      />
      <Link
        href="/news"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          color: 'var(--muted)',
          fontWeight: 600,
          textDecoration: 'none',
          margin: '0.75rem 0 1rem',
        }}
      >
        <ArrowLeft size={18} /> К новостям
      </Link>

      <article
        style={{
          background: '#fff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(15,23,42,0.06)',
          overflow: 'hidden',
        }}
      >
        {item.videoEmbedUrl ? (
          <NewsVideoEmbed src={item.videoEmbedUrl} title={item.title} />
        ) : (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#e2e8f0' }}>
            <NewsCoverImage
              src={item.imageUrl}
              alt={item.title || 'Новость'}
              priority
              sizes="(max-width: 820px) 100vw, 820px"
            />
          </div>
        )}
        <div style={{ padding: '1.5rem 1.35rem 1.75rem' }}>
          <span
            style={{
              color: 'var(--muted)',
              fontSize: '0.9rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: '0.75rem',
            }}
          >
            <CalendarDays size={15} />
            {formatRuDate(when, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {item.title && (
            <h1 className="page-hero-title" style={{ margin: '0 0 0.5rem' }}>
              {item.title}
            </h1>
          )}
          <ViewBeacon type="NEWS" id={item.id} initialCount={item.viewCount ?? 0} style={{ marginBottom: '1rem' }} />
          <div
            style={{
              fontSize: '1.05rem',
              lineHeight: 1.7,
              color: 'var(--foreground)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {item.text}
          </div>
          {item.vkLink && (
            <a
              href={item.vkLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: '1.5rem',
                padding: '0.65rem 1.1rem',
              }}
            >
              Оригинал во ВКонтакте <ExternalLink size={16} />
            </a>
          )}
        </div>
      </article>
      <RelatedLinks
        title="Ещё новости"
        items={related.map((r) => ({
          href: `/news/${encodeRouteParam(r.id)}`,
          title: r.title || 'Новость',
          meta: (r.publishedAt || r.createdAt)?.toLocaleDateString?.('ru-RU') || null,
        }))}
      />
    </div>
  );
}
