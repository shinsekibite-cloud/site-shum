import ContestDetailClient from '@/components/ContestDetailClient';

export const metadata = { title: 'Конкурс' };
export const revalidate = 60;
export const dynamic = 'force-static';

export default async function ContestDetailPage() {
  return <ContestDetailClient />;
}
