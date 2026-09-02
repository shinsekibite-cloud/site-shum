import Link from 'next/link';
import { ArrowLeft, Images } from 'lucide-react';
import { canViewPortalGallery, getGallerySettings } from '@/lib/gallery';
import PortalActivityGallery from '@/components/PortalActivityGallery';
import type { Metadata } from 'next';
import GalleryAuthClient from '@/components/GalleryAuthClient';

export const metadata: Metadata = {
  title: 'Галерея деятельности портала',
  description: 'Моменты работы администрации портала: пространства, события и команда.',
};

export const revalidate = 60;
export const dynamic = 'force-static';

export default async function PortalGalleryPage() {
  const settings = await getGallerySettings();

  if (!settings.pageEnabled) {
    return (
      <div className="container" style={{ padding: '2.5rem 1rem 4rem', maxWidth: 720 }}>
        <p style={{ color: 'var(--muted)' }}>Раздел галереи временно отключён.</p>
        <Link href="/" className="btn btn-secondary" style={{ marginTop: 12, display: 'inline-flex' }}>
          На главную
        </Link>
      </div>
    );
  }

  const publicOk = canViewPortalGallery({
    pageEnabled: settings.pageEnabled,
    publicEnabled: settings.publicEnabled,
    isAuthenticated: false,
    surface: 'page',
  });

  if (!publicOk) {
    return <GalleryAuthClient />;
  }

  const items = settings.orgGalleryItems;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
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
          <div>
            <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Галерея деятельности
            </h1>
            <p style={{ margin: '0.2rem 0 0', color: 'var(--muted)', fontSize: '0.92rem', lineHeight: 1.45 }}>
              Как работает администрация портала: события, пространства и команда Центра развития
              молодёжи Сочи.
            </p>
          </div>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="glass" style={{ padding: '2rem 1.25rem', textAlign: 'center', color: 'var(--muted)' }}>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            Пока нет опубликованных фото. Загляните позже — раздел наполняет администрация портала.
          </p>
        </div>
      ) : (
        <PortalActivityGallery items={items} />
      )}
    </div>
  );
}
