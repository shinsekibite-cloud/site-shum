import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { publishedWhere } from '@/lib/publish';
import { encodeRouteParam } from '@/lib/route-id';
import { getModuleFlags } from '@/lib/module-flags';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const { brandedMetadata } = await import('@/lib/branded-metadata');
  return brandedMetadata('Поиск', {
    description: 'Поиск по проектам, клубам, пространствам и новостям портала.',
    canonicalPath: '/search',
  });
}

/** Postgres: case-insensitive substring match (SQLite was effectively CI). */
function containsCI(query: string) {
  return { contains: query, mode: 'insensitive' as const };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const resolvedParams = await searchParams;
  const q = resolvedParams.q || '';
  const flags = await getModuleFlags();

  if (!q || q.trim() === '') {
    return (
      <div className="container search-page">
        <div className="search-page__empty">
          <h1 className="page-hero-title">Поиск по сайту</h1>
          <p className="page-hero-subtitle" style={{ margin: '0.35rem 0 0', textAlign: 'left' }}>
            Найдите проекты, клубы, пространства и новости.
          </p>
          <form action="/search" method="GET" className="search-page__form">
            <input
              type="search"
              name="q"
              className="search-page__input"
              placeholder="Что ищем?"
              autoFocus
              aria-label="Поисковый запрос"
            />
            <button type="submit" className="btn btn-primary">
              Найти
            </button>
          </form>
        </div>
      </div>
    );
  }

  const query = q.trim();
  const textMatch = containsCI(query);

  const [projects, clubs, spaces, pages, news] = await Promise.all([
    flags.projects !== false
      ? prisma.project.findMany({
          where: {
            status: { not: 'INACTIVE' },
            OR: [{ title: textMatch }, { description: textMatch }],
          },
          take: 10,
        })
      : Promise.resolve([]),
    flags.clubs !== false
      ? prisma.club.findMany({
          where: {
            status: { not: 'INACTIVE' },
            OR: [{ title: textMatch }, { description: textMatch }],
          },
          take: 10,
        })
      : Promise.resolve([]),
    flags.spaces !== false
      ? prisma.space.findMany({
          where: {
            status: { not: 'INACTIVE' },
            OR: [{ title: textMatch }, { description: textMatch }, { address: textMatch }],
          },
          take: 10,
        })
      : Promise.resolve([]),
    prisma.pageContent.findMany({
      where: {
        AND: [publishedWhere(), { OR: [{ title: textMatch }, { content: textMatch }] }],
      },
      take: 10,
    }),
    flags.news !== false
      ? prisma.news.findMany({
          where: {
            AND: [publishedWhere(), { OR: [{ title: textMatch }, { text: textMatch }] }],
          },
          take: 10,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  const totalResults = projects.length + clubs.length + spaces.length + pages.length + news.length;

  const sections: { title: string; items: { id: string; href: string; title: string; desc?: string | null }[] }[] = [
    {
      title: `Проекты (${projects.length})`,
      items: projects.map((p) => ({
        id: p.id,
        href: `/projects/${encodeRouteParam(p.id)}`,
        title: p.title || "Без названия",
        desc: p.description,
      })),
    },
    {
      title: `Клубы (${clubs.length})`,
      items: clubs.map((c) => ({
        id: c.id,
        href: `/clubs/${encodeRouteParam(c.id)}`,
        title: c.title || "Без названия",
        desc: c.description,
      })),
    },
    {
      title: `Пространства (${spaces.length})`,
      items: spaces.map((s) => ({
        id: s.id,
        href: `/spaces/${encodeRouteParam(s.id)}`,
        title: s.title || "Без названия",
        desc: s.address || s.description,
      })),
    },
    {
      title: `Страницы (${pages.length})`,
      items: pages.map((p) => ({
        id: p.id,
        href: `/p/${p.slug}`,
        title: p.title || "Без названия",
        desc: null,
      })),
    },
    {
      title: `Новости (${news.length})`,
      items: news.map((n) => ({
        id: n.id,
        href: `/news/${encodeRouteParam(n.id)}`,
        title: n.title || "Без названия",
        desc: n.text,
      })),
    },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="container search-page">
      <div className="search-page__head">
        <Search size={28} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 4 }} aria-hidden />
        <div>
          <h1 className="page-hero-title">Результаты поиска</h1>
          <p>
            По запросу «{query}» — {totalResults}
          </p>
        </div>
      </div>

      <form action="/search" method="GET" className="search-page__form" style={{ marginBottom: '1.25rem' }}>
        <input
          type="search"
          name="q"
          defaultValue={query}
          className="search-page__input"
          placeholder="Новый запрос…"
          aria-label="Поисковый запрос"
        />
        <button type="submit" className="btn btn-primary">
          Найти
        </button>
      </form>

      {totalResults === 0 && (
        <div className="search-page__card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <p style={{ margin: 0, color: 'var(--muted)' }}>Ничего не найдено. Попробуйте другой запрос.</p>
        </div>
      )}

      {sections.map((section) => (
        <div key={section.title} className="search-page__section">
          <h2>{section.title}</h2>
          <div className="search-page__list">
            {section.items.map((item) => (
              <Link key={item.id} href={item.href} className="search-page__card">
                <h3>{item.title}</h3>
                {item.desc ? <p>{item.desc.substring(0, 120)}{item.desc.length > 120 ? '…' : ''}</p> : null}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
