'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Immersive chrome for admin + ops (hides public glass-nav via body.is-admin). */
export default function StaffChrome() {
  const pathname = usePathname() || '';
  const staff =
    pathname.startsWith('/admin') || pathname.startsWith('/ops') || pathname.startsWith('/scanner');

  useEffect(() => {
    if (!staff) {
      document.body.classList.remove('is-admin');
      return;
    }
    document.body.classList.add('is-admin');
    return () => document.body.classList.remove('is-admin');
  }, [staff]);

  return null;
}
