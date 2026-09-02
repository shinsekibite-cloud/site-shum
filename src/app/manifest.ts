import type { MetadataRoute } from 'next';
import { getSiteIdentity } from '@/lib/site-identity';

/** Dynamic PWA manifest — name follows SiteSettings.siteName */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { siteName, shortName } = await getSiteIdentity();
  return {
    id: '/',
    name: siteName,
    short_name: shortName,
    description: `Официальный портал: проекты, клубы, пространства, новости — ${siteName}`,
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f8fafc',
    theme_color: '#0d9488',
    lang: 'ru',
    categories: ['lifestyle', 'social'],
    shortcuts: [
      {
        name: 'Мои билеты',
        short_name: 'Билеты',
        description: 'Открыть QR-билеты на мероприятия',
        url: '/tickets',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Афиша',
        short_name: 'Афиша',
        url: '/events',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
