'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FaqCategory } from '@/lib/faq-content';

export default function FaqAccordion({ categories }: { categories: FaqCategory[] }) {
  const [open, setOpen] = useState<string | null>(
    categories[0]?.items[0] ? `${categories[0].id}-0` : null
  );

  if (!categories.length) {
    return (
      <p style={{ color: 'var(--muted)' }}>
        Сейчас разделы FAQ скрыты — связанные модули временно недоступны.
      </p>
    );
  }

  return (
    <div className="faq-accordion">
      {categories.map((cat) => (
        <section key={cat.id} className="faq-accordion__cat" aria-labelledby={`faq-cat-${cat.id}`}>
          <h2 id={`faq-cat-${cat.id}`} className="faq-accordion__cat-title">
            {cat.title}
          </h2>
          <div className="faq-accordion__list">
            {cat.items.map((item, idx) => {
              const id = `${cat.id}-${idx}`;
              const isOpen = open === id;
              return (
                <div key={id} className={`faq-accordion__item glass${isOpen ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="faq-accordion__q"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : id)}
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      size={18}
                      aria-hidden
                      className="faq-accordion__chev"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                    />
                  </button>
                  {isOpen ? <div className="faq-accordion__a">{item.a}</div> : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
