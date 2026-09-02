import AdminSystemClient from '@/components/admin/AdminSystemClient';
import { requireAdminPage } from '@/lib/acl';
import { requireModulePage } from '@/lib/require-module-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Состояние сервера' };

export default async function AdminSystemPage() {
  await requireAdminPage();
  // TECH bypasses; non-TECH admins need server_status module
  await requireModulePage('server_status');
  return <AdminSystemClient />;
}
