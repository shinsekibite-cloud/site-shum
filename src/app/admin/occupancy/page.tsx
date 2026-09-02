import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminOccupancyClient from '@/components/admin/AdminOccupancyClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Занятость залов' };

export default async function AdminOccupancyPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?callbackUrl=/admin/occupancy&staff=1');
  const role = session.user?.role;
  if (role !== 'ADMIN' && role !== 'MODERATOR' && role !== 'SCANNER') {
    redirect('/dashboard');
  }

  return (
    <div className="container" style={{ padding: '1.5rem 1rem 4rem' }}>
      <h1 style={{ marginBottom: '0.35rem' }}>Сводка залов</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.25rem' }}>
        День по всем площадкам · быстрая блокировка слота
      </p>
      <AdminOccupancyClient />
    </div>
  );
}
