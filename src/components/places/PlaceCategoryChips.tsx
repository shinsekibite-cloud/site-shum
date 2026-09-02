'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import { PLACE_CATEGORIES, PLACE_CATEGORY_META, type PlaceCategoryCode } from '@/lib/places';

export default function PlaceCategoryChips() {
  const pathname = usePathname();
  const searchParams = useSafeSearchParams();
  const current = (searchParams.get('category') || 'ALL').toUpperCase();
  const q = searchParams.get('q') || '';

  const hrefFor = (cat: string) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (cat !== 'ALL') params.set('category', cat);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div className="places-chips" role="tablist" aria-label="Категории мест">
      <Link
        href={hrefFor('ALL')}
        className={`places-chip ${current === 'ALL' ? 'is-active' : ''}`}
        role="tab"
        aria-selected={current === 'ALL'}
      >
        Все
      </Link>
      {PLACE_CATEGORIES.map((code) => {
        const meta = PLACE_CATEGORY_META[code as PlaceCategoryCode];
        return (
          <Link
            key={code}
            href={hrefFor(code)}
            className={`places-chip ${current === code ? 'is-active' : ''}`}
            role="tab"
            aria-selected={current === code}
            data-cat={code}
          >
            {meta.label}
          </Link>
        );
      })}
    </div>
  );
}
