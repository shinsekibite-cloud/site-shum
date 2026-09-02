import type { ReactNode } from 'react';
import { requireModulePage } from '@/lib/require-module-page';

export default async function Layout({ children }: { children: ReactNode }) {
  await requireModulePage('registration');
  return children;
}
