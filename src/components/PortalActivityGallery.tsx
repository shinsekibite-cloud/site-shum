'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { GalleryItem } from '@/lib/gallery-shared';

type Props = {
  items: GalleryItem[];
};

export default function PortalActivityGallery({ items }: Props) {
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  if (!items.length) return null;

  return (
    <>
      <div className="portal-activity-grid">
        {items.map((item, idx) => (
          <button
            key={`${item.url}-${idx}`}
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
