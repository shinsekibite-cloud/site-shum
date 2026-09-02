import { requirePermissionPage } from '@/lib/acl';
import AdminSecurityClient from '@/components/admin/AdminSecurityClient';

export default async function AdminSecurityPage() {
  await requirePermissionPage('moderation');
  return <AdminSecurityClient />;
}
