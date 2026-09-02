'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Images } from 'lucide-react';
import { useSession } from 'next-auth/react';
import PortalActivityGallery from '@/components/PortalActivityGallery';
import type { GalleryItem } from '@/lib/gallery-shared';

/** Private gallery shell: guests are redirected by proxy; this hydrates photos after login. */
export default function GalleryAuthClient() {
  const { status } = useSession();
  const [items, setItems] = useState<GalleryItem[] | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/public/gallery')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setItems(Array.isArray(d?.items) ? d.items : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className="container portal-gallery-page" style={{ padding: '1.75rem 1rem 4rem', maxWidth: 960 }}>
      <Link
        href="/"
        className="portal-gallery-back"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--muted)',
          textDecoration: 'none',
          fontSize: '0.88rem',
          fontWeight: 600,
          marginBottom: '1.25rem',
        }}
      >
        <ArrowLeft size={16} /> На главную
      </Link>
      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'rgba(37,99,235,0.1)',
              color: 'var(--primary)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Images size={20} />
          </span>
          <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 800 }}>Галерея деятельности</h1>
        </div>
      </header>
      {status !== 'authenticated' ? (
        <p style={{ color: 'var(--muted)' }}>Войдите, чтобы посмотреть галерею.</p>
      ) : items == null ? (
        <p style={{ color: 'var(--muted)' }}>Загрузка…</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Пока нет опубликованных фото.</p>
      ) : (
        <PortalActivityGallery items={items} />
      )}
    </div>
  );
}
