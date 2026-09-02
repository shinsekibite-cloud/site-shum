'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import { MapPin, Star } from 'lucide-react';
import {
  PLACE_CATEGORIES,
  PLACE_CATEGORY_META,
  normalizePlaceCategory,
  placeCategoryCodesFor,
  type PlaceCategoryCode,
} from '@/lib/places';
import { encodeRouteParam } from '@/lib/route-id';
import { placeCover } from '@/lib/theme-covers';
import PlaceCategoryChips from '@/components/places/PlaceCategoryChips';
import CatalogPagination from '@/components/CatalogPagination';
import { CATALOG_PAGE_SIZE, catalogSlice, totalPages } from '@/lib/pagination';
import type { PublicPlaceCard } from '@/lib/public-catalogs';

export default function PlacesCatalogClient({ items }: { items: PublicPlaceCard[] }) {
  const sp = useSafeSearchParams();
  const query = (sp.get('q') || '').trim().toLowerCase();
  const categoryRaw = (sp.get('category') || '').trim().toUpperCase();
  const categoryFilter =
    categoryRaw && categoryRaw !== 'ALL' && (PLACE_CATEGORIES as readonly string[]).includes(categoryRaw)
      ? normalizePlaceCategory(categoryRaw)
      : null;
  const sort = sp.get('sort') === 'rating' || sp.get('sort') === 'title' ? sp.get('sort')! : 'order';
  const page = catalogSlice(sp.get('page') || '1').page;

  const filtered = useMemo(() => {
    let list = items.slice();
    if (query) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          String(p.summary || '').toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          String(p.address || '').toLowerCase().includes(query) ||
          String(p.district || '').toLowerCase().includes(query)
      );
    }
    if (categoryFilter) {
      list = list.filter((place) => placeCategoryCodesFor(place).includes(categoryFilter));
    }
    if (sort === 'rating') {
      list.sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount || a.title.localeCompare(b.title, 'ru'));
    } else if (sort === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    } else {
      list.sort((a, b) => a.sortOrder - b.sortOrder || b.ratingAvg - a.ratingAvg || a.title.localeCompare(b.title, 'ru'));
    }
    return list;
  }, [items, query, categoryFilter, sort]);

  const total = filtered.length;
  const { skip, take } = catalogSlice(page);
  const pageItems = filtered.slice(skip, skip + take);
  const pages = totalPages(total, CATALOG_PAGE_SIZE);
  const listQuery = {
    q: query || undefined,
    category: categoryFilter || undefined,
    sort: sort !== 'order' ? sort : undefined,
  };
  const heroCover = placeCover({ id: 'places-hero', title: 'Куда сходить' }, 0);

  return (
    <div className="places-page catalog-page">
      <header className="places-hero places-hero--image-only" style={{ backgroundImage: `url(${heroCover})` }} aria-label="Куда сходить">
        <span className="sr-only">Куда сходить — гид по Сочи</span>
      </header>
      <div className="container places-page__head">
        <h1 className="page-hero-title">Куда сходить</h1>
        <p className="page-hero-subtitle" style={{ marginTop: 0 }}>
          Пляжи, горы, парки и смотровые — с маршрутом и советами.
        </p>
      </div>

      <div className="container places-catalog">
        <div className="places-toolbar places-toolbar--stack">
          <form className="places-search" method="get" action="/places" role="search">
            {categoryFilter ? <input type="hidden" name="category" value={categoryFilter} /> : null}
            <input
              id="places-q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Найти место…"
              autoComplete="off"
              aria-label="Поиск мест"
            />
            <label className="places-sort">
              <span className="sr-only">Сортировка</span>
              <select name="sort" defaultValue={sort} aria-label="Сортировка">
                <option value="order">По порядку</option>
                <option value="rating">По рейтингу</option>
                <option value="title">По названию</option>
              </select>
            </label>
            <button type="submit" className="places-search__btn">
              Найти
            </button>
          </form>
          <PlaceCategoryChips />
        </div>

        {pageItems.length === 0 ? (
          <div className="places-empty catalog-empty">Пока нет опубликованных мест в этой категории.</div>
        ) : (
          <div className="places-grid">
            {pageItems.map((place, index) => {
              const codes = placeCategoryCodesFor(place);
              const primary = normalizePlaceCategory(place.category) as PlaceCategoryCode;
              const meta = PLACE_CATEGORY_META[primary];
              const href = `/places/${encodeRouteParam(place.slug || place.id)}`;
              const cover = placeCover(place, skip + index);
              return (
                <Link
                  key={place.id}
                  href={href}
                  className="places-card"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <div className="places-card__media" style={{ backgroundImage: `url(${cover})` }}>
                    <span className="places-card__cat" style={{ color: meta.color, background: meta.bg }}>
                      {meta.label}
                      {codes.length > 1 ? ` · +${codes.length - 1}` : ''}
                    </span>
                  </div>
                  <div className="places-card__body">
                    <h2>{place.title}</h2>
                    {place.summary ? <p>{place.summary}</p> : null}
                    <div className="places-card__meta">
                      {place.district ? (
                        <span>
                          <MapPin size={14} /> {place.district}
                        </span>
                      ) : null}
                      <span className="places-card__rating">
                        <Star size={14} fill="currentColor" />
                        {place.ratingCount > 0 ? `${place.ratingAvg.toFixed(1)} · ${place.ratingCount}` : 'Новое'}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <CatalogPagination page={page} totalPages={pages} basePath="/places" query={listQuery} />
      </div>
    </div>
  );
}
