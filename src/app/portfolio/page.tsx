import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** `/portfolio` is not a public catalog — send users to the cabinet portfolio. */
export default async function PortfolioIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect('/login?callbackUrl=' + encodeURIComponent('/dashboard/portfolio'));
  }
  redirect('/dashboard/portfolio');
}
