import { Metadata } from 'next';
import { getCachedPublicProjects } from '@/lib/public-catalogs';
import ProjectsCatalogClient from '@/components/catalog/ProjectsCatalogClient';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const { brandedMetadata } = await import('@/lib/branded-metadata');
  return brandedMetadata('Проекты', {
    description: 'Молодёжные проекты Центра развития молодежи Сочи — от КВН до форумов и фестивалей.',
    canonicalPath: '/projects',
  });
}

export default async function ProjectsPage() {
  const items = await getCachedPublicProjects();
  return <ProjectsCatalogClient items={items} />;
}
