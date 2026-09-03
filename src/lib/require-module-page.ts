import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import {
  getModuleOffModes,
  getOffModeForKey,
  isModuleEnabled,
  type ModuleFlagKey,
} from '@/lib/module-flags';

/** Server-page guard: redirect to /unavailable when module is off (TECH bypasses). */
export async function requireModulePage(key: ModuleFlagKey) {
  const session = await getServerSession(authOptions);
  if (!(await isModuleEnabled(key, session?.user?.role))) {
    const modes = await getModuleOffModes();
    const mode = getOffModeForKey(modes, key);
    redirect(`/unavailable?m=${encodeURIComponent(key)}&mode=${mode}`);
  }
}

/**
 * Public catalogs: no session (keeps the route static).
 * TECH bypass and guest kill-switch already run in `src/proxy.ts`.
 * Use this only when a page must still 404-redirect if flags flip mid-ISR.
 */
export async function requirePublicModulePage(key: ModuleFlagKey) {
  if (!(await isModuleEnabled(key))) {
    const modes = await getModuleOffModes();
    const mode = getOffModeForKey(modes, key);
    redirect(`/unavailable?m=${encodeURIComponent(key)}&mode=${mode}`);
  }
}
