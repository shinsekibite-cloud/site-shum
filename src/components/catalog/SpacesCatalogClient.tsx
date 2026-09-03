'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import { MapPin } from 'lucide-react';
import EntityCoverImage from '@/components/EntityCoverImage';
import GuestAuthPrompt from '@/components/GuestAuthPrompt';
import SpaceFilterBar from '@/components/SpaceFilterBar';
import {
  SPACE_CATEGORIES,
  parseSpaceAmenities,
} from '@/lib/spaces';
import { encodeRouteParam } from '@/lib/route-id';
import { spaceCover } from '@/lib/theme-covers';
import CatalogPagination from '@/components/CatalogPagination';
import { CATALOG_PAGE_SIZE, catalogSlice, totalPages } from '@/lib/pagination';
import type { PublicSpaceCard } from '@/lib/public-catalogs';
import { isCoworkingSpace } from '@/lib/coworking';

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
        <h1 className="page-hero-title">Молодёжные пространства</h1>
        <p className="page-hero-subtitle">Коворкинг и залы ЦРМ — запись и бронь в одном стиле</p>
      </div>
      <SpaceFilterBar placeholder="Поиск пространств…" categories={usedCategories} />

      {spaces.length === 0 ? (
        <div className="svc-empty">
          <h3>{items.length === 0 ? 'Каталог временно недоступен' : 'Ничего не найдено'}</h3>
          <p>
            {items.length === 0
              ? 'Обновите страницу или попробуйте позже.'
              : 'Смените категорию или поисковый запрос.'}
          </p>
          {items.length === 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Повторить
            </button>
          ) : (
            <Link href="/spaces" className="btn btn-primary">
              Сбросить фильтры
            </Link>
          )}
        </div>
      ) : (
        <div className="svc-space-grid">
          {spaces.map((space, idx) => {
            const coworking = isCoworkingSpace(space);
            const statusLine =
              space.status === 'COMPLETED'
                ? 'площадка закрыта'
                : coworking
                  ? `до ${space.capacity} мест`
                  : (space.bookings?.length || 0) > 0
                    ? `событий рядом: ${space.bookings.length}`
                    : 'есть свободные слоты';
            const href = `/spaces/${encodeRouteParam(space.id)}`;
            const ctaHref = coworking
              ? `/coworking?space=${encodeURIComponent(space.id)}`
              : `${href}/book`;
            const ctaLabel = coworking ? 'В коворкинг' : 'Забронировать';

            return (
              <article key={space.id} className="svc-space-card">
                <Link href={href} className="svc-space-card__photo" aria-label={space.title}>
                  <EntityCoverImage
                    src={spaceCover(space, skip + idx)}
                    alt={space.title}
                    fallback={spaceCover(space, skip + idx + 5)}
                    className="svc-space-card__img"
                    sizes="160px"
                  />
                </Link>
                <div className="svc-space-card__body">
                  <span className="svc-space-card__badge">{space.category || (coworking ? 'Коворкинг' : 'Зал')}</span>
                  <h3>
                    <Link href={href}>{space.title}</Link>
                  </h3>
                  <p className="svc-space-card__addr">
                    <MapPin size={14} aria-hidden />
                    <span>{space.address || 'Сочи'}</span>
                  </p>
                  <p className={`svc-space-card__status${coworking ? ' is-cowork' : ''}`}>{statusLine}</p>
                  {space.status !== 'COMPLETED' ? (
                    <GuestAuthPrompt
                      href={ctaHref}
                      className="svc-pill svc-pill--brand svc-space-card__cta"
                      asButton
                    >
                      {ctaLabel}
                    </GuestAuthPrompt>
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
