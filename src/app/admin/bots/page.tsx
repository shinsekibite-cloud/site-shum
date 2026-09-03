import AdminBotsClient from '@/components/admin/AdminBotsClient';
import { requireAdminPage } from '@/lib/acl';
import { requireModulePage } from '@/lib/require-module-page';

export const dynamic = 'force-dynamic';

export default async function AdminBotsPage() {
  await requireAdminPage();
  await requireModulePage('bots');
  return <AdminBotsClient />;
}
