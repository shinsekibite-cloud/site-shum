import { requirePermissionPage } from '@/lib/acl';
import AdminVacanciesClient from '@/components/admin/AdminVacanciesClient';

export const metadata = { title: 'Админ · Вакансии' };

export default async function AdminVacanciesPage() {
  await requirePermissionPage('vacancies');
  return <AdminVacanciesClient />;
}
