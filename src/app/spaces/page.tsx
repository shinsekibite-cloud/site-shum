import { Metadata } from 'next';
import { getCachedPublicSpaces } from '@/lib/public-catalogs';
import SpacesCatalogClient from '@/components/catalog/SpacesCatalogClient';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const { brandedMetadata } = await import('@/lib/branded-metadata');
  return brandedMetadata('Пространства', {
    description: 'Молодёжные пространства для встреч, учёбы и событий.',
    canonicalPath: '/spaces',
  });
}

export default async function SpacesPage() {
  const items = await getCachedPublicSpaces();
  return <SpacesCatalogClient items={items} />;
}
