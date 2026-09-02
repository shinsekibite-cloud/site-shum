import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import AdminAwardsClient from './AdminAwardsClient';

export const dynamic = 'force-dynamic';

export default async function AdminAwardsPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (!session?.user || (role !== 'ADMIN' && role !== 'MODERATOR')) {
    redirect('/login');
  }
  return (
    <div className="container" style={{ padding: '1.25rem 1rem 2.5rem', maxWidth: 1100 }}>
      <AdminAwardsClient />
    </div>
  );
}
