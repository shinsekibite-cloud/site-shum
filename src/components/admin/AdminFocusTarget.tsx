'use client';

import { useEffect } from 'react';

/** Scroll + briefly highlight an element by id (for ?focus= deep links). */
export default function AdminFocusTarget({ id }: { id?: string | null }) {
  useEffect(() => {
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.setAttribute('data-focus-flash', '1');
    const t = window.setTimeout(() => el.removeAttribute('data-focus-flash'), 2200);
    return () => window.clearTimeout(t);
  }, [id]);
  return null;
}
