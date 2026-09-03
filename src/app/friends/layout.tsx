import type { ReactNode } from 'react';
import { requireModulePage } from '@/lib/require-module-page';

export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: ReactNode }) {
  await requireModulePage('friends');
  return children;
}
