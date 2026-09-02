'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import FaqAccordion from '@/components/FaqAccordion';
import { searchFaqCategories, type FaqCategory } from '@/lib/faq-content';

export default function FaqHub({ categories }: { categories: FaqCategory[] }) {
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all');
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const bySearch = searchFaqCategories(categories, deferredQuery);
    if (activeCat === 'all') return bySearch;
    return bySearch.filter((c) => c.id === activeCat);
  }, [categories, deferredQuery, activeCat]);

  const totalItems = filtered.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="faq-hub">
      <div className="faq-hub__search" role="search">
        <Search size={18} aria-hidden className="faq-hub__search-icon" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по вопросам и ответам…"
          aria-label="Поиск по FAQ"
          className="faq-hub__input"
        />
        {query ? (
          <button
            type="button"
            className="faq-hub__clear"
            aria-label="Очистить поиск"
            onClick={() => setQuery('')}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      <div className="faq-hub__cats" role="tablist" aria-label="Категории FAQ">
        <button
          type="button"
          role="tab"
          aria-selected={activeCat === 'all'}
          className={`faq-hub__chip${activeCat === 'all' ? ' is-active' : ''}`}
          onClick={() => setActiveCat('all')}
        >
          Все
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={activeCat === c.id}
            className={`faq-hub__chip${activeCat === c.id ? ' is-active' : ''}`}
            onClick={() => setActiveCat(c.id)}
          >
            {c.title}
          </button>
        ))}
      </div>

      <p className="faq-hub__meta" aria-live="polite">
        {totalItems === 0
          ? 'Ничего не найдено — попробуйте другой запрос или категорию.'
          : `Найдено: ${totalItems}`}
      </p>

      <FaqAccordion key={`${activeCat}:${deferredQuery}`} categories={filtered} />
    </div>
  );
}
