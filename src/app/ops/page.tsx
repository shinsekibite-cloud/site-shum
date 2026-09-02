import { getServerSession } from 'next-auth/next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { isTechRole } from '@/lib/module-flags';
import OpsConsoleClient from '@/components/OpsConsoleClient';
import NotificationsBell from '@/components/NotificationsBell';

export const metadata = { title: 'Ops' };
export const dynamic = 'force-dynamic';

export default async function OpsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isTechRole(session.user.role)) {
    notFound();
  }
  return (
    <div className="ops-page-shell">
      <div className="ops-page-shell__top">
        <NotificationsBell compact useNavStyle />
      </div>
      <header className="ops-page-shell__hero">
        <div className="ops-page-shell__hero-row">
          <div>
            <h1>Ops</h1>
            <p>Техконсоль: модули, карта связей, презентация и безопасность учётки.</p>
          </div>
          <nav className="ops-page-shell__exits" aria-label="Выход из Ops">
            <Link href="/" className="ops-exit-home">
              На сайт
            </Link>
            <Link href="/dashboard">Кабинет</Link>
          </nav>
        </div>
      </header>
      <OpsConsoleClient />
    </div>
  );
}
