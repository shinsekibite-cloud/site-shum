'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import { ArrowRight, CalendarDays, MapPin, Users } from 'lucide-react';
import SpaceEventsModal from '@/components/SpaceEventsModal';
import YandexDirections from '@/components/YandexDirections';
import EntityCoverImage from '@/components/EntityCoverImage';
import SpaceFilterBar from '@/components/SpaceFilterBar';
import {
  SPACE_CATEGORIES,
  amenityLabel,
  parseSpaceAmenities,
} from '@/lib/spaces';
import { encodeRouteParam } from '@/lib/route-id';
import { spaceCover } from '@/lib/theme-covers';
import CatalogPagination from '@/components/CatalogPagination';
import { CATALOG_PAGE_SIZE, catalogSlice, totalPages } from '@/lib/pagination';
import type { PublicSpaceCard } from '@/lib/public-catalogs';

export default function SpacesCatalogClient({ items }: { items: PublicSpaceCard[] }) {
  const sp = useSafeSearchParams();
  const query = (sp.get('q') || '').trim().toLowerCase();
  const statusFilter = sp.get('status') || 'ALL';
  const categoryFilter = (sp.get('category') || '').trim();
  const amenityFilter = (sp.get('amenity') || '').trim();
  const page = catalogSlice(sp.get('page') || '1').page;

  const filtered = useMemo(() => {
    let list = items.slice();
    if (query) {
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          String(s.address || '').toLowerCase().includes(query) ||
          String(s.description || '').toLowerCase().includes(query) ||
          String(s.category || '').toLowerCase().includes(query)
      );
    }
    if (statusFilter !== 'ALL') list = list.filter((s) => s.status === statusFilter);
    if (categoryFilter && categoryFilter !== 'ALL') list = list.filter((s) => s.category === categoryFilter);
    if (amenityFilter && amenityFilter !== 'ALL') {
      list = list.filter((s) => parseSpaceAmenities(s.amenities).includes(amenityFilter as never));
    }
    return list;
  }, [items, query, statusFilter, categoryFilter, amenityFilter]);

  const total = filtered.length;
  const { skip, take } = catalogSlice(page);
  const spaces = filtered.slice(skip, skip + take);
  const pages = totalPages(total, CATALOG_PAGE_SIZE);
  const listQuery = { q: query || undefined, category: categoryFilter || undefined };
  const usedCategories = Array.from(new Set([...SPACE_CATEGORIES, ...items.map((s) => s.category).filter(Boolean)])) as string[];

  return (
    <div className="container catalog-page">
      <div className="catalog-page-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <h1 className="text-gradient page-hero-title" style={{ marginBottom: '0.75rem' }}>
          Молодёжные пространства
        </h1>
        <SpaceFilterBar placeholder="Поиск пространств…" categories={usedCategories} />
      </div>

      {spaces.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem 1.5rem',
            background: 'white',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--muted)',
            border: '1px solid rgba(15,23,42,0.06)',
          }}
        >
          <h3 style={{ color: 'var(--foreground)', marginBottom: '0.5rem' }}>
            {items.length === 0 ? 'Каталог временно недоступен' : 'Ничего не найдено'}
          </h3>
          <p style={{ maxWidth: 420, margin: '0 auto' }}>
            {items.length === 0
              ? 'Обновите страницу или попробуйте позже.'
              : 'Попробуйте сменить категорию, особенность или поисковый запрос.'}
          </p>
          {items.length === 0 ? (
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: '1rem' }}
              onClick={() => window.location.reload()}
            >
              Повторить
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid-cards">
          {spaces.map((space, idx) => {
            const amenities = parseSpaceAmenities(space.amenities);
            return (
              <article key={space.id} className="catalog-card catalog-card--hit" style={{ position: 'relative' }}>
                <Link
                  href={`/spaces/${encodeRouteParam(space.id)}`}
                  className="catalog-card__hit-link"
                  aria-label={space.title}
                />
                <div className={`catalog-badge${space.status === 'COMPLETED' ? ' status-completed' : ''}`}>
                  {space.status === 'COMPLETED' ? 'Завершено' : 'Открыто'}
                </div>
                <div className="catalog-img-wrap" style={{ position: 'relative' }}>
                  <EntityCoverImage
                    src={spaceCover(space, skip + idx)}
                    alt={space.title}
                    fallback={spaceCover(space, skip + idx + 5)}
                    className="catalog-img"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div
                  style={{
                    padding: '1.25rem 1.25rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    flexGrow: 1,
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {space.category && (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.55rem',
                          borderRadius: 999,
                          background: 'rgba(59,130,246,0.1)',
                          color: 'var(--primary)',
                        }}
                      >
                        {space.category}
                      </span>
                    )}
                    {amenities.slice(0, 3).map((id) => (
                      <span
                        key={id}
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.55rem',
                          borderRadius: 999,
                          background: 'rgba(15,23,42,0.05)',
                          color: 'var(--muted)',
                        }}
                      >
                        {amenityLabel(id)}
                      </span>
                    ))}
                    {amenities.length > 3 && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)', alignSelf: 'center' }}>
                        +{amenities.length - 3}
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.3, color: 'var(--foreground)' }}>
                    {space.title}
                  </h3>
                  <div className="catalog-card__facts" style={{ gap: '0.35rem' }}>
                    <span>
                      <Users size={14} aria-hidden />
                      до {space.capacity} чел.
                    </span>
                    {(space.bookings?.length || 0) > 0 ? (
                      <span>
                        <CalendarDays size={14} aria-hidden />
                        ближайших событий: {space.bookings.length}
                      </span>
                    ) : (
                      <span>
                        <CalendarDays size={14} aria-hidden />
                        свободные слоты — бронируйте
                      </span>
                    )}
                  </div>
                  <div className="catalog-card__interactive">
                    <SpaceEventsModal
                      bookings={(space.bookings || []).map((b) => ({
                        ...b,
                        _count: { participants: b.participantsCount },
                      }))}
                      spaceTitle={space.title}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      color: 'var(--muted)',
                      fontSize: '0.9rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <MapPin size={16} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--accent)' }} />
                    <span style={{ flex: '1 1 140px', minWidth: 0 }}>{space.address}</span>
                    {space.address && (
                      <span className="catalog-card__interactive">
                        <YandexDirections address={space.address} placeName={space.title} compact />
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      color: 'var(--muted)',
                      fontSize: '0.95rem',
                      flexGrow: 1,
                      lineHeight: 1.6,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {space.description?.replace(/<[^>]+>/g, '')}
                  </p>
                  <div className="catalog-card-meta">
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        color: 'var(--muted)',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                      }}
                    >
                      <Users size={16} />
                      Вместимость: {space.capacity} чел.
                    </span>
                    <span
                      style={{
                        color: 'var(--accent)',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.95rem',
                      }}
                    >
                      Подробнее <ArrowRight size={16} />
                    </span>
                  </div>
                  {space.status !== 'COMPLETED' ? (
                    <div className="catalog-card__interactive" style={{ marginTop: '0.15rem' }}>
                      <Link
                        href={`/spaces/${encodeRouteParam(space.id)}/book`}
                        className="btn btn-primary"
                        style={{
                          padding: '0.55rem 0.9rem',
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          width: '100%',
                          justifyContent: 'center',
                          textDecoration: 'none',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Забронировать
                      </Link>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <CatalogPagination page={page} totalPages={pages} basePath="/spaces" query={listQuery} />
    </div>
  );
}
