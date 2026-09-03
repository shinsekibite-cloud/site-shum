'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy /more — authenticated users go to the single profile (/dashboard).
 * Guests see login/register only (no second profile hub).
 */
export default function MorePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [registrationOn, setRegistrationOn] = useState(true);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        if (d.modules && typeof d.modules === 'object' && d.modules.registration === false) {
          setRegistrationOn(false);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Guests must never stick on «Переход…» if session stays loading.
  if (status === 'authenticated') {
    return <main className="yp-more container">Переход в профиль…</main>;
  }

  return (
    <main className="yp-more container">
      <h1>Профиль</h1>
      <p className="yp-more__lead">Войдите, чтобы открыть личный кабинет.</p>
      <div className="yp-more__cta-row">
        <Link href="/login?callbackUrl=%2Fdashboard" className="btn btn-primary">
          Войти
        </Link>
        {registrationOn ? (
          <Link href="/register?callbackUrl=%2Fdashboard" className="btn btn-secondary">
            Регистрация
          </Link>
        ) : null}
      </div>
    </main>
  );
}
