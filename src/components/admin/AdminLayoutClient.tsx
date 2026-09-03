'use client';

import { useSafeSearchParams } from '@/lib/use-safe-search-params';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminSidebar from '@/components/admin/AdminSidebar';
import Link from 'next/link';
import { pingSecurity } from '@/lib/device-fingerprint';
import { canAccessAdminPath } from '@/lib/acl-shared';

function notifyAdminDenied(setBanner: (v: boolean) => void) {
  setBanner(true);
  try {
    sessionStorage.setItem('yp-admin-denied', '1');
  } catch {
    /* ignore */
  }
  toast.error('Недостаточно прав для этого раздела');
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname() || '/admin';
  const searchParams = useSafeSearchParams();
  const [deniedBanner, setDeniedBanner] = useState(false);
  const deniedToastShown = useRef(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status !== 'authenticated') return;

    const role = session.user?.role;
    const perms = (session.user?.permissions as string) || '';

    if (role === 'TECH') {
      router.replace('/ops');
      return;
    }
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      router.push('/dashboard');
      return;
    }
    if (!canAccessAdminPath(role, perms, pathname)) {
      if (!deniedToastShown.current) {
        deniedToastShown.current = true;
        notifyAdminDenied(setDeniedBanner);
      }
      router.replace('/admin?denied=1');
      return;
    }
    pingSecurity('PING');
  }, [status, session, router, pathname]);

  useEffect(() => {
    const fromQuery = searchParams.get('denied') === '1';
    let fromStorage = false;
    try {
      fromStorage = sessionStorage.getItem('yp-admin-denied') === '1';
      if (fromStorage) sessionStorage.removeItem('yp-admin-denied');
    } catch {
      /* ignore */
    }
    if (!fromQuery && !fromStorage) return;
    setDeniedBanner(true);
    if (!deniedToastShown.current) {
      deniedToastShown.current = true;
      toast.error('Недостаточно прав для этого раздела');
    }
    if (fromQuery && pathname === '/admin') {
      router.replace('/admin');
    }
  }, [searchParams, pathname, router]);

  // Immersive chrome (hide public nav) is owned by StaffChrome in root layout

  if (status === 'loading' || !session) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        Загрузка админ-панели...
      </div>
    );
  }

  const userRole = session.user?.role || '';
  const userPermissions = ((session.user?.permissions as string) || '').split(',').filter(Boolean);

  if (userRole === 'TECH') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        Перенаправление…
      </div>
    );
  }

  if (userRole !== 'ADMIN' && userRole !== 'MODERATOR') {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 1rem', color: 'red' }}>
        <ShieldAlert size={48} style={{ margin: '0 auto 1rem' }} /> У вас нет доступа к этому разделу.
      </div>
    );
  }

  return (
    <div className="admin-layout-wrapper" data-admin-shell="1">
      <AdminSidebar userRole={userRole} userPermissions={userPermissions} />
      <main className="admin-main" id="admin-main">
        <nav className="admin-escape-bar" aria-label="Выход из панели">
          <Link href="/" className="admin-escape-bar__home">
            ← На сайт
          </Link>
          <Link href="/dashboard">Кабинет</Link>
          <Link href="/admin">Панель</Link>
        </nav>
        {deniedBanner ? (
          <div
            role="status"
            className="admin-denied-banner"
          >
            Недостаточно прав для запрошенного раздела.
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  return <AdminLayoutInner>{children}</AdminLayoutInner>;
}
