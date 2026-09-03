'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

const STAFF = new Set(['ADMIN', 'MODERATOR', 'SCANNER', 'TECH']);

/** Staff-only banner. Must not live in the root layout as a server session read. */
export default function MaintenanceStaffBanner() {
  const { data: session, status } = useSession();
  const [on, setOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setOn(Boolean(d?.maintenanceMode));
      })
      .catch(() => {
        if (!cancelled) setOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!on || status !== 'authenticated') return null;
  if (!STAFF.has(session?.user?.role || '')) return null;

  return (
    <div className="maintenance-staff-banner">
      Режим «На сайте проводятся работы» включён — обычные посетители видят заглушку.
      <Link href="/admin/settings?tab=maintenance">Настройки</Link>
    </div>
  );
}
