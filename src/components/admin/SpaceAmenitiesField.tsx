'use client';

import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { SPACE_AMENITIES, parseSpaceAmenities } from '@/lib/spaces';

type Props = {
  /** JSON string or comma-separated amenity ids from DB */
  defaultValue?: string | null;
};

export default function SpaceAmenitiesField({ defaultValue }: Props) {
  const initial = useMemo(() => new Set<string>(parseSpaceAmenities(defaultValue)), [defaultValue]);
  const [selected, setSelected] = useState(() => new Set<string>(initial));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set<string>(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-amenities-field">
      <div className="space-amenities-field__label">Особенности площадки</div>
      <div className="space-amenities-field__grid" role="group" aria-label="Особенности площадки">
        {SPACE_AMENITIES.map((a) => {
          const on = selected.has(a.id);
          return (
            <button
              key={a.id}
              type="button"
              className={`space-amenities-chip${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => toggle(a.id)}
            >
              {on ? <Check size={12} /> : null}
              {a.label}
              {on ? <input type="hidden" name="amenities" value={a.id} /> : null}
            </button>
          );
        })}
      </div>
      <p className="space-amenities-field__hint">Коротко отметьте, что есть на площадке.</p>
    </div>
  );
}
