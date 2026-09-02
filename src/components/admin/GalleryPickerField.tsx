'use client';

import { useMemo, useState } from 'react';
import { Check, ImagePlus } from 'lucide-react';
import { parseGalleryItems, galleryUrls, type GalleryItem } from '@/lib/gallery-shared';

type Props = {
  name?: string;
  label?: string;
  defaultValue?: string | null;
  /** Shared org gallery pool (URLs) */
  pool?: string[];
  max?: number;
};

/** Compact gallery editor: pick from org pool + paste URLs. Stores JSON string[]. */
export default function GalleryPickerField({
  name = 'gallery',
  label = 'Галерея',
  defaultValue,
  pool = [],
  max = 24,
}: Props) {
  const initial = useMemo(() => parseGalleryItems(defaultValue, max), [defaultValue, max]);
  const [items, setItems] = useState<GalleryItem[]>(initial);
  const selected = useMemo(() => new Set(items.map((i) => i.url)), [items]);
  const serialized = JSON.stringify(galleryUrls(items).slice(0, max));

  const togglePool = (url: string) => {
    setItems((prev) => {
      if (prev.some((i) => i.url === url)) return prev.filter((i) => i.url !== url);
      if (prev.length >= max) return prev;
      return [...prev, { url }];
    });
  };

  return (
    <div className="gallery-picker-field">
      <label className="gallery-picker-field__label">{label}</label>
      <input type="hidden" name={name} value={serialized} />
      {pool.length > 0 ? (
        <div className="gallery-picker-field__pool" role="list">
          {pool.map((url) => {
            const on = selected.has(url);
            return (
              <button
                key={url}
                type="button"
                role="listitem"
                className={`gallery-picker-field__thumb${on ? ' is-on' : ''}`}
                onClick={() => togglePool(url)}
                title={url}
                style={{ backgroundImage: `url(${url})` }}
              >
                {on ? (
                  <span className="gallery-picker-field__check">
                    <Check size={12} />
                  </span>
                ) : (
                  <span className="gallery-picker-field__add">
                    <ImagePlus size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
      <textarea
        className="settings-input"
        rows={3}
        value={items.map((i) => i.url).join('\n')}
        onChange={(e) => setItems(parseGalleryItems(e.target.value, max))}
        placeholder={'/uploads/…\nпо одной ссылке на строку'}
      />
      <p className="gallery-picker-field__hint">
        Выберите из общей базы или вставьте URL. Макс. {max}. Фото лучше заранее оптимизировать (WebP).
      </p>
    </div>
  );
}
