import { requirePermissionPage } from '@/lib/acl';
import AdminContestsClient from '@/components/admin/AdminContestsClient';

export const metadata = { title: 'Админ · Конкурсы' };

export default async function AdminContestsPage() {
  await requirePermissionPage('contests');
  return <AdminContestsClient />;
}
