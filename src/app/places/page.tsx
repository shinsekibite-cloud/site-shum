import { Metadata } from 'next';
import { getCachedPublicPlaces } from '@/lib/public-catalogs';
import PlacesCatalogClient from '@/components/catalog/PlacesCatalogClient';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const { brandedMetadata } = await import('@/lib/branded-metadata');
  return brandedMetadata('Куда сходить в Сочи', {
    description: 'Пляжи, горы, парки и смотровые — гид по местам Сочи 2026.',
    canonicalPath: '/places',
  });
}

export default async function PlacesPage() {
  const items = await getCachedPublicPlaces();
  return <PlacesCatalogClient items={items} />;
}
