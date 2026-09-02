import { Metadata } from 'next';
import { getCachedPublicClubs } from '@/lib/public-catalogs';
import ClubsCatalogClient from '@/components/catalog/ClubsCatalogClient';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const { brandedMetadata } = await import('@/lib/branded-metadata');
  return brandedMetadata('Клубы по интересам', {
    description: 'Найди единомышленников, вступай в клубы и развивайся вместе с молодёжным сообществом.',
    canonicalPath: '/clubs',
  });
}

export default async function ClubsPage() {
  const items = await getCachedPublicClubs();
  return <ClubsCatalogClient items={items} />;
}
