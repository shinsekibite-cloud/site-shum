import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import TicketScanner from '@/components/TicketScanner';
import ScannerErrorBoundary from '@/components/ScannerErrorBoundary';
import { canUseScanner } from '@/lib/acl';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Сканер билетов',
};

export default async function ScannerPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?callbackUrl=/scanner');
  if (!canUseScanner(session.user?.role, session.user?.permissions)) {
    redirect('/dashboard');
  }

  // Admins/moderators stay in admin chrome (same tab strip)
  const role = session.user?.role || '';
  if (role === 'ADMIN' || role === 'MODERATOR') {
    redirect('/admin/scanner');
  }

  return (
    <div className="scanner-shell">
      <ScannerErrorBoundary>
        <TicketScanner />
      </ScannerErrorBoundary>
    </div>
  );
}
