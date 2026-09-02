import { requirePermissionPage } from '@/lib/acl';
import AdminFaqClient from '@/components/admin/AdminFaqClient';

export const dynamic = 'force-dynamic';

export default async function AdminFaqPage() {
  await requirePermissionPage('pages');
  return <AdminFaqClient />;
}
