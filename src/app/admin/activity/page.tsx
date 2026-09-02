import AdminActivityClient from '@/components/admin/AdminActivityClient';

export const dynamic = 'force-dynamic';

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const sp = await searchParams;
  return <AdminActivityClient initialCategory={sp.category || ''} />;
}
