import VacancyDetailClient from '@/components/VacancyDetailClient';

export const metadata = { title: 'Вакансия' };
export const revalidate = 60;
export const dynamic = 'force-static';

export default async function VacancyDetailPage() {
  return <VacancyDetailClient />;
}
