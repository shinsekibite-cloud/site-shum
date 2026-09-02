'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import { useSession } from 'next-auth/react';
import { ArrowRight, Calendar, MapPin, Users } from 'lucide-react';
import EntityCoverImage from '@/components/EntityCoverImage';
import FilterBar from '@/components/FilterBar';
import { parseClubTags, stripHtml } from '@/lib/clubs';
import YandexDirections from '@/components/YandexDirections';
import { encodeRouteParam } from '@/lib/route-id';
import { clubCover } from '@/lib/theme-covers';
import CatalogPagination from '@/components/CatalogPagination';
import { CATALOG_PAGE_SIZE, catalogSlice, totalPages } from '@/lib/pagination';
import type { PublicClubCard } from '@/lib/public-catalogs';

type SortKey = 'title' | 'new' | 'popular';

export default function ClubsCatalogClient({ items }: { items: PublicClubCard[] }) {
  const sp = useSafeSearchParams();
  const { status: authStatus } = useSession();
  const query = (sp.get('q') || '').trim().toLowerCase();
  const statusFilter = sp.get('status') || 'ALL';
  const sort = (['title', 'new', 'popular'].includes(sp.get('sort') || '')
    ? sp.get('sort')
    : 'title') as SortKey;
  const cat = (sp.get('cat') || 'ALL').trim();
  const page = catalogSlice(sp.get('page') || '1').page;
  const [myApps, setMyApps] = useState<Record<string, string>>({});

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/user/applications')
      .then((r) => (r.ok ? r.json() : []))
      .then((apps) => {
        if (cancelled || !Array.isArray(apps)) return;
        const next: Record<string, string> = {};
        for (const a of apps) {
          if (a.clubId) next[a.clubId] = a.status;
        }
        setMyApps(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  const categoryOptions = useMemo(() => {
    const tagSet = new Set<string>();
    for (const row of items) {
      for (const t of parseClubTags(row.tags)) {
        const clean = t.replace(/^#/, '').trim();
        if (clean) tagSet.add(clean);
      }
    }
    return Array.from(tagSet)
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .slice(0, 24)
      .map((t) => ({ key: t, label: t.startsWith('#') ? t : `#${t}` }));
  }, [items]);

  const filtered = useMemo(() => {
    let list = items.slice();
    if (query) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(query) ||
          String(c.tags || '').toLowerCase().includes(query)
      );
    }
    if (statusFilter !== 'ALL') list = list.filter((c) => c.status === statusFilter);
    if (cat !== 'ALL') {
      const needle = cat.replace(/^#/, '').toLowerCase();
      list = list.filter((c) =>
        parseClubTags(c.tags).some((t) => t.replace(/^#/, '').toLowerCase() === needle)
      );
    }
    if (sort === 'new') list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sort === 'popular') list.sort((a, b) => b.membersCount - a.membersCount || a.title.localeCompare(b.title, 'ru'));
    else list.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    return list;
  }, [items, query, statusFilter, sort, cat]);

  const total = filtered.length;
  const { skip, take } = catalogSlice(page);
  const clubs = filtered.slice(skip, skip + take);
  const pages = totalPages(total, CATALOG_PAGE_SIZE);
  const listQuery = {
    q: query || undefined,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    sort: sort !== 'title' ? sort : undefined,
    cat: cat !== 'ALL' ? cat : undefined,
  };

  return (
    <div className="container catalog-page">
      <div className="catalog-page-header">
        <div className="catalog-page-header__intro">
          <h1 className="page-hero-title">Молодёжные клубы</h1>
          <p className="catalog-page-header__count">
            {total ? `${total} ${total === 1 ? 'клуб' : total < 5 ? 'клуба' : 'клубов'}` : 'Каталог клубов'}
          </p>
        </div>
        <div className="catalog-page-header__search">
          <FilterBar
            placeholder="Поиск по названию или тегу…"
            sortOptions={[
              { key: 'title', label: 'По названию' },
              { key: 'new', label: 'Сначала новые' },
              { key: 'popular', label: 'Популярные' },
            ]}
            categoryOptions={categoryOptions.length ? categoryOptions : undefined}
          />
        </div>
      </div>

      {clubs.length === 0 ? (
        <div className="catalog-empty">
          <h3>{items.length === 0 ? 'Каталог временно недоступен' : 'Клубов не найдено'}</h3>
          <p>
            {items.length === 0
              ? 'Обновите страницу или попробуйте позже.'
              : 'Сбросьте фильтры или загляните позже.'}
          </p>
          {items.length === 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Повторить
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid-cards">
          {clubs.map((club, idx) => {
            const tags = parseClubTags(club.tags);
            const members = club.membersCount;
            const mine = myApps[club.id];
            const open = club.status !== 'COMPLETED';
            const excerpt = stripHtml(club.description).slice(0, 140);

            return (
              <Link key={club.id} href={`/clubs/${encodeRouteParam(club.id)}`} className="catalog-card">
                <div className={`catalog-badge${club.status === 'COMPLETED' ? ' status-completed' : ''}`}>
                  {club.status === 'COMPLETED' ? 'Завершён' : 'Активный'}
                </div>
                <div className="catalog-img-wrap" style={{ position: 'relative' }}>
                  <EntityCoverImage
                    src={clubCover(club, skip + idx)}
                    alt={club.title}
                    fallback={clubCover(club, skip + idx + 5)}
                    className="catalog-img"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div className="catalog-card__body">
                  <h3>{club.title.replace(/^Клуб:\s*/i, '')}</h3>
                  {tags.length > 0 && (
                    <div className="catalog-card__tags">
                      {tags.slice(0, 4).map((t) => (
                        <span key={t}>{t.startsWith('#') ? t : `#${t}`}</span>
                      ))}
                    </div>
                  )}
                  <p className="line-clamp-3">{excerpt || 'Подробности на странице клуба.'}</p>
                  <div className="catalog-card__facts">
                    {club.meetingSchedule && (
                      <span>
                        <Calendar size={14} /> {club.meetingSchedule}
                      </span>
                    )}
                    {club.meetingPlace && (
                      <span style={{ position: 'relative', zIndex: 2 }}>
                        <MapPin size={14} /> {club.meetingPlace}
                        <YandexDirections address={club.meetingPlace} placeName={club.title} compact />
                      </span>
                    )}
                    <span>
                      <Users size={14} /> {members}{' '}
                      {members % 10 === 1 && members % 100 !== 11
                        ? 'участник'
                        : members % 10 >= 2 && members % 10 <= 4 && (members % 100 < 10 || members % 100 >= 20)
                          ? 'участника'
                          : 'участников'}
                    </span>
                  </div>
                  <div className="catalog-card-meta">
                    <span>
                      {mine === 'APPROVED'
                        ? 'Вы участник'
                        : mine === 'PENDING'
                          ? 'Заявка на рассмотрении'
                          : open
                            ? 'Открыт для заявок'
                            : 'Набор закрыт'}
                    </span>
                    <span>
                      {open ? 'Подробнее' : 'Смотреть'} <ArrowRight size={16} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <CatalogPagination page={page} totalPages={pages} basePath="/clubs" query={listQuery} />
    </div>
  );
}
