'use client';

import { Search, X, SlidersHorizontal, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import { useState, useEffect, useRef, useTransition } from 'react';
import { SPACE_CATEGORIES, SPACE_AMENITIES } from '@/lib/spaces';

type Props = {
  placeholder?: string;
  categories?: string[];
};

export default function SpaceFilterBar({
  placeholder = 'Поиск пространств…',
  categories = [...SPACE_CATEGORIES],
}: Props) {
  const router = useRouter();
  const searchParams = useSafeSearchParams();
  const [, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [status, setStatus] = useState(searchParams.get('status') || 'ALL');
  const [category, setCategory] = useState(searchParams.get('category') || 'ALL');
  const [amenity, setAmenity] = useState(searchParams.get('amenity') || 'ALL');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setStatus(searchParams.get('status') || 'ALL');
    setCategory(searchParams.get('category') || 'ALL');
    setAmenity(searchParams.get('amenity') || 'ALL');
  }, [searchParams]);

  useEffect(() => {
    const handler = setTimeout(() => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (status && status !== 'ALL') params.set('status', status);
      if (category && category !== 'ALL') params.set('category', category);
      if (amenity && amenity !== 'ALL') params.set('amenity', amenity);
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `?${qs}` : '?', { scroll: false });
      });
    }, 280);
    return () => clearTimeout(handler);
  }, [query, status, category, amenity, router]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activeCount =
    (status !== 'ALL' ? 1 : 0) + (category !== 'ALL' ? 1 : 0) + (amenity !== 'ALL' ? 1 : 0);

  const resetFilters = () => {
    setStatus('ALL');
    setCategory('ALL');
    setAmenity('ALL');
  };

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      key={label}
      onClick={onClick}
      className={`space-filter-chip${active ? ' is-active' : ''}`}
    >
      {active ? <Check size={11} /> : null}
      {label}
    </button>
  );

  return (
    <div ref={panelRef} className="space-filter-bar">
      <div className="space-filter-bar__row">
        <div className="space-filter-bar__search">
          <Search size={16} className="space-filter-bar__search-icon" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="space-filter-bar__input"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="space-filter-bar__clear" aria-label="Очистить">
              <X size={14} />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`space-filter-bar__toggle${open ? ' is-open' : ''}`}
        >
          <SlidersHorizontal size={15} />
          Фильтры
          {activeCount > 0 ? <span className="space-filter-bar__badge">{activeCount}</span> : null}
        </button>
      </div>

      {open ? (
        <div className="space-filter-panel" role="dialog" aria-label="Фильтры пространств">
          <div className="space-filter-panel__head">
            <strong>Фильтры</strong>
            <div className="space-filter-panel__head-actions">
              {activeCount > 0 ? (
                <button type="button" className="space-filter-panel__reset" onClick={resetFilters}>
                  Сбросить
                </button>
              ) : null}
              <button type="button" className="yp-modal-close" aria-label="Закрыть" onClick={() => setOpen(false)}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="space-filter-panel__section">
            <div className="space-filter-panel__label">Статус</div>
            <div className="space-filter-panel__chips">
              {chip(status === 'ALL', 'Все', () => setStatus('ALL'))}
              {chip(status === 'ACTIVE', 'Активные', () => setStatus('ACTIVE'))}
              {chip(status === 'COMPLETED', 'Завершённые', () => setStatus('COMPLETED'))}
            </div>
          </div>

          <div className="space-filter-panel__section">
            <div className="space-filter-panel__label">Категория</div>
            <div className="space-filter-panel__chips is-scroll">
              {chip(category === 'ALL', 'Все', () => setCategory('ALL'))}
              {categories.map((c) => chip(category === c, c, () => setCategory(c)))}
            </div>
          </div>

          <div className="space-filter-panel__section">
            <div className="space-filter-panel__label">Особенности</div>
            <div className="space-filter-panel__chips is-scroll">
              {chip(amenity === 'ALL', 'Любые', () => setAmenity('ALL'))}
              {SPACE_AMENITIES.map((a) => chip(amenity === a.id, a.label, () => setAmenity(a.id)))}
            </div>
          </div>

          <button type="button" onClick={() => setOpen(false)} className="btn btn-primary space-filter-panel__done">
            Готово
          </button>
        </div>
      ) : null}
    </div>
  );
}
