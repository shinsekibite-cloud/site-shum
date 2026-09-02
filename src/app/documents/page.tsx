import type { Metadata } from 'next';
import { getCachedPublicDocuments } from '@/lib/public-catalogs';
import DocumentsCatalogClient from '@/components/catalog/DocumentsCatalogClient';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const { brandedMetadata } = await import('@/lib/branded-metadata');
  return brandedMetadata('Документы', {
    description: 'Положения, формы и нормативные документы портала',
    canonicalPath: '/documents',
  });
}

export default async function DocumentsPage() {
  const items = await getCachedPublicDocuments();
  return <DocumentsCatalogClient items={items} />;
}
