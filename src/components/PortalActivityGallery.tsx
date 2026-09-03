'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { GalleryItem } from '@/lib/gallery-shared';

type Props = {
  items: GalleryItem[];
};

type DayGroup = {
  key: string;
  label: string;
  items: GalleryItem[];
};

function dayKey(iso?: string, fallbackIdx = 0): string {
  if (!iso) return `unknown-${fallbackIdx}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `unknown-${fallbackIdx}`;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(key: string): string {
  if (key.startsWith('unknown')) return 'Без даты';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startThat = new Date(y, m - 1, d);
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86400000);
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

function groupByDay(items: GalleryItem[]): DayGroup[] {
  const map = new Map<string, GalleryItem[]>();
  items.forEach((item, idx) => {
    const key = dayKey(item.createdAt, idx);
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  });
  const keys = [...map.keys()].sort((a, b) => {
    if (a.startsWith('unknown') && b.startsWith('unknown')) return 0;
    if (a.startsWith('unknown')) return 1;
    if (b.startsWith('unknown')) return -1;
    return b.localeCompare(a);
  });
  return keys.map((key) => ({
    key,
    label: dayLabel(key),
    items: map.get(key) || [],
  }));
}

export default function PortalActivityGallery({ items }: Props) {
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const groups = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });
    return groupByDay(sorted);
  }, [items]);

  if (!items.length) return null;

  return (
    <>
      <div className="portal-activity-by-day">
        {groups.map((group) => (
          <section key={group.key} className="portal-activity-day">
            <header className="portal-activity-day__head">
              <h2 className="portal-activity-day__title">{group.label}</h2>
              <span className="portal-activity-day__count">
                {group.items.length}{' '}
                {group.items.length === 1 ? 'фото' : group.items.length < 5 ? 'фото' : 'фото'}
              </span>
            </header>
            <div className="portal-activity-grid">
              {group.items.map((item, idx) => (
                <button
                  key={`${item.url}-${group.key}-${idx}`}
                  type="button"
                  className="portal-activity-card"
                  onClick={() => setSelected(item)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.caption || `Кадр ${idx + 1}`} loading="lazy" />
                  {item.caption ? <span className="portal-activity-caption">{item.caption}</span> : null}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {selected ? (
        <div
          className="portal-activity-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
        >
          <button
            type="button"
            className="portal-activity-lightbox-close"
            aria-label="Закрыть"
            onClick={() => setSelected(null)}
          >
            <X size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.url}
            alt={selected.caption || 'Фото'}
            onClick={(e) => e.stopPropagation()}
          />
          {selected.caption ? <p className="portal-activity-lightbox-cap">{selected.caption}</p> : null}
        </div>
      ) : null}
    </>
  );
}
