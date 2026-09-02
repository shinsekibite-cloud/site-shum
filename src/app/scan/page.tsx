import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { canUseScanner } from '@/lib/acl';
import PresenceScanner from '@/components/PresenceScanner';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Скан пропуска',
};

export default async function ScanPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?callbackUrl=/scan&staff=1');
  if (!canUseScanner(session.user?.role, session.user?.permissions)) {
    redirect('/dashboard');
  }

  return (
    <div className="scanner-shell">
      <PresenceScanner />
    </div>
  );
}
