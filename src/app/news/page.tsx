import { Metadata } from 'next';
import { getCachedPublicNews } from '@/lib/public-catalogs';
import NewsCatalogClient from '@/components/catalog/NewsCatalogClient';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const { brandedMetadata } = await import('@/lib/branded-metadata');
  return brandedMetadata('Новости', {
    description: 'Все самые свежие события и посты из нашей группы ВКонтакте',
    canonicalPath: '/news',
  });
}

export default async function NewsPage() {
  const items = await getCachedPublicNews();
  return <NewsCatalogClient items={items} />;
}
