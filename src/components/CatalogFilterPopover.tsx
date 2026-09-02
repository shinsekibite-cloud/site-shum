'use client';

/**
 * Compact one-row catalog toolbar: search + status/sort/category in a popover.
 */
import { Filter, Search, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import { useEffect, useId, useRef, useState } from 'react';

type Opt = { key: string; label: string };

const DEFAULT_STATUS: Opt[] = [
  { key: 'ALL', label: 'Все' },
  { key: 'ACTIVE', label: 'Активные' },
  { key: 'COMPLETED', label: 'Завершённые' },
];

const DEFAULT_SORT: Opt[] = [
  { key: 'title', label: 'По названию' },
  { key: 'new', label: 'Сначала новые' },
  { key: 'popular', label: 'Популярные' },
];

export default function CatalogFilterPopover({
  placeholder = 'Поиск…',
  statusOptions = DEFAULT_STATUS,
  sortOptions = DEFAULT_SORT,
  categoryOptions,
  categoryParam = 'cat',
  hideStatus = false,
}: {
  placeholder?: string;
  statusOptions?: Opt[];
  sortOptions?: Opt[];
  categoryOptions?: Opt[];
  categoryParam?: string;
  hideStatus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSafeSearchParams();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const skip = useRef(true);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [status, setStatus] = useState(searchParams.get('status') || 'ALL');
  const [sort, setSort] = useState(searchParams.get('sort') || sortOptions[0]?.key || 'title');
  const [cat, setCat] = useState(searchParams.get(categoryParam) || 'ALL');

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setStatus(searchParams.get('status') || 'ALL');
    setSort(searchParams.get('sort') || sortOptions[0]?.key || 'title');
    setCat(searchParams.get(categoryParam) || 'ALL');
  }, [searchParams, sortOptions, categoryParam]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (skip.current) {
        skip.current = false;
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      if (query.trim()) params.set('q', query.trim());
      else params.delete('q');
      if (!hideStatus) {
        if (status && status !== 'ALL') params.set('status', status);
        else params.delete('status');
      }
      const defSort = sortOptions[0]?.key || 'title';
      if (sort && sort !== defSort) params.set('sort', sort);
      else params.delete('sort');
      if (categoryOptions?.length) {
        if (cat && cat !== 'ALL') params.set(categoryParam, cat);
        else params.delete(categoryParam);
      }
      params.delete('page');
      const next = params.toString();
      const cur = searchParams.toString();
      if (next !== cur) router.replace(`${pathname}${next ? `?${next}` : ''}`, { scroll: false });
    }, 220);
    return () => clearTimeout(t);
  }, [
    query,
    status,
    sort,
    cat,
    router,
    pathname,
    searchParams,
    hideStatus,
    sortOptions,
    categoryOptions,
    categoryParam,
  ]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activeFilters =
    (!hideStatus && status !== 'ALL' ? 1 : 0) +
    (sort !== (sortOptions[0]?.key || 'title') ? 1 : 0) +
    (cat !== 'ALL' ? 1 : 0);

  const chip = (active: boolean) =>
    `catalog-filter-pop__chip${active ? ' is-active' : ''}`;

  return (
    <div className="catalog-filter-pop" ref={rootRef}>
      <div className="catalog-filter-pop__row">
        <div className="catalog-filter-pop__search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />
          {query ? (
            <button type="button" aria-label="Очистить" onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className={`catalog-filter-pop__toggle${open || activeFilters ? ' is-on' : ''}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <Filter size={15} aria-hidden />
          Фильтры
          {activeFilters ? <span className="catalog-filter-pop__badge">{activeFilters}</span> : null}
        </button>
      </div>

      {open ? (
        <div id={panelId} className="catalog-filter-pop__panel" role="dialog" aria-label="Фильтры и сортировка">
          {!hideStatus ? (
            <div className="catalog-filter-pop__group">
              <div className="catalog-filter-pop__label">Статус</div>
              <div className="catalog-filter-pop__chips">
                {statusOptions.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className={chip(status === o.key)}
                    onClick={() => setStatus(o.key)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="catalog-filter-pop__group">
            <div className="catalog-filter-pop__label">Сортировка</div>
            <div className="catalog-filter-pop__chips">
              {sortOptions.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={chip(sort === o.key)}
                  onClick={() => setSort(o.key)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {categoryOptions?.length ? (
            <div className="catalog-filter-pop__group">
              <div className="catalog-filter-pop__label">Категория</div>
              <div className="catalog-filter-pop__chips">
                <button type="button" className={chip(cat === 'ALL')} onClick={() => setCat('ALL')}>
                  Все
                </button>
                {categoryOptions.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className={chip(cat === o.key)}
                    onClick={() => setCat(o.key)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="catalog-filter-pop__foot">
            <button
              type="button"
              className="catalog-filter-pop__reset"
              onClick={() => {
                setStatus('ALL');
                setSort(sortOptions[0]?.key || 'title');
                setCat('ALL');
                setQuery('');
              }}
            >
              Сбросить
            </button>
            <button type="button" className="btn btn-primary catalog-filter-pop__done" onClick={() => setOpen(false)}>
              Готово
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
