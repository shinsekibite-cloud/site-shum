import VacanciesClient from '@/components/VacanciesClient';

export const metadata = { title: 'Вакансии' };
export const revalidate = 60;
export const dynamic = 'force-static';

export default async function VacanciesPage() {
  return <VacanciesClient />;
}
