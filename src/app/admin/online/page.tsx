import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import AdminOnlineUsersClient from './AdminOnlineUsersClient';

export const dynamic = 'force-dynamic';

export default async function AdminOnlinePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'MODERATOR')) {
    redirect('/login');
  }
  return (
    <div className="container" style={{ padding: '1.25rem 1rem 2.5rem', maxWidth: 1200 }}>
      <AdminOnlineUsersClient />
    </div>
  );
}
