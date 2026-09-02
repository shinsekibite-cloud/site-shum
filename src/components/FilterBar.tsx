'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import { useEffect, useRef, useState } from 'react';

type StatusOption = { key: string; label: string };
type SortOption = { key: string; label: string };
type CategoryOption = { key: string; label: string };

const DEFAULT_STATUS_OPTIONS: StatusOption[] = [
  { key: 'ALL', label: 'Все' },
  { key: 'ACTIVE', label: 'Активные' },
  { key: 'COMPLETED', label: 'Завершенные' },
];

const DEFAULT_SORT_OPTIONS: SortOption[] = [
  { key: 'title', label: 'По названию' },
  { key: 'new', label: 'Сначала новые' },
  { key: 'popular', label: 'Популярные' },
];

export default function FilterBar({
  placeholder = 'Поиск...',
  totalCount = 0,
  hideStatus = false,
  statusOptions = DEFAULT_STATUS_OPTIONS,
  sortOptions,
  categoryOptions,
  categoryParam = 'cat',
}: {
  placeholder?: string;
  totalCount?: number;
  hideStatus?: boolean;
  statusOptions?: StatusOption[];
  /** When set, shows sort select bound to `?sort=` */
  sortOptions?: SortOption[];
  /** When set, shows category chips bound to `?{categoryParam}=` */
  categoryOptions?: CategoryOption[];
  categoryParam?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSafeSearchParams();
  const skipFirstPush = useRef(true);
  const sorts = sortOptions?.length ? sortOptions : null;
  const cats = categoryOptions?.length ? categoryOptions : null;

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [status, setStatus] = useState(searchParams.get('status') || 'ALL');
  const [sort, setSort] = useState(searchParams.get('sort') || sorts?.[0]?.key || 'title');
  const [cat, setCat] = useState(searchParams.get(categoryParam) || 'ALL');

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setStatus(searchParams.get('status') || 'ALL');
    setSort(searchParams.get('sort') || sorts?.[0]?.key || 'title');
    setCat(searchParams.get(categoryParam) || 'ALL');
  }, [searchParams, sorts, categoryParam]);

  useEffect(() => {
    const handler = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query.trim()) params.set('q', query.trim());
      else params.delete('q');

      if (hideStatus) {
        /* keep URL status if bar doesn't own it */
      } else if (status && status !== 'ALL') {
        params.set('status', status);
      } else {
        params.delete('status');
      }

      if (sorts) {
        const defaultSort = sorts[0]?.key || 'title';
        if (sort && sort !== defaultSort) params.set('sort', sort);
        else params.delete('sort');
      }

      if (cats) {
        if (cat && cat !== 'ALL') params.set(categoryParam, cat);
        else params.delete(categoryParam);
      }

      params.delete('page');

      const qs = params.toString();
      const next = qs ? `${pathname}?${qs}` : pathname;
      const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      if (skipFirstPush.current) {
        skipFirstPush.current = false;
        if (next === current) return;
      }
      if (next === current) return;
      router.push(next, { scroll: false });
    }, 300);

    return () => clearTimeout(handler);
  }, [query, status, sort, cat, router, pathname, hideStatus, searchParams, sorts, cats, categoryParam]);

  void totalCount;

  const chipClass = (key: string, active: boolean, muted = false) => {
    let cls = 'filter-bar__chip';
    if (!active) return cls;
    if (key === 'ALL') cls += ' is-active is-active--all';
    else if (muted) cls += ' is-active is-active--muted';
    else cls += ' is-active is-active--primary';
    return cls;
  };

  return (
    <div className="filter-bar filter-bar--compact">
      <div className="filter-bar__row filter-bar__row--one">
        <div className="filter-bar__search-wrap">
          <Search size={16} className="filter-bar__icon" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="filter-bar__input"
            aria-label={placeholder}
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="filter-bar__clear" aria-label="Очистить поиск">
              <X size={14} />
            </button>
          ) : null}
        </div>
        {sorts ? (
          <label className="filter-bar__sort">
            <span className="sr-only">Сортировка</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Сортировка"
            >
              {sorts.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!hideStatus ? (
          <div className="filter-bar__chips filter-bar__chips--inline" role="group" aria-label="Фильтр по статусу">
            {statusOptions.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                className={chipClass(key, status === key, key === 'COMPLETED' || key === 'CLOSED')}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {cats ? (
          <div className="filter-bar__chips filter-bar__chips--inline" role="group" aria-label="Категории">
            <button type="button" onClick={() => setCat('ALL')} className={chipClass('ALL', cat === 'ALL')}>
              Все
            </button>
            {cats.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setCat(key)}
                className={chipClass(key, cat === key)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
