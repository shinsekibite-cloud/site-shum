'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — profile edit lives on `/dashboard#profile-edit`. */
export default function DashboardEditRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard#profile-edit');
  }, [router]);
  return (
    <div className="container" style={{ padding: '2rem 1rem', color: 'var(--muted)' }}>
      Переходим к данным профиля…
    </div>
  );
}
