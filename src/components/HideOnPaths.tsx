'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const HIDE_PREFIXES = [
  '/presentation/view',
  '/maintenance',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

/** Hides site chrome on auth/maintenance/immersive routes. Pathname is client-only — keeps the root layout static. */
export default function HideOnPaths({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '';
  if (HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
  return <>{children}</>;
}
