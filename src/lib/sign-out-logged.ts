'use client';

import { signOut } from 'next-auth/react';
import { pingSecurity } from '@/lib/device-fingerprint';

/** Record LOGOUT then end the NextAuth session. */
export async function signOutLogged(opts?: { callbackUrl?: string }) {
  // Не ждём audit: на слабом VPS /api/user/security + CSRF иногда висит,
  // и пользователь видит 502 при выходе (особенно во время rebuild).
  void Promise.race([
    pingSecurity('LOGOUT'),
    new Promise<void>((resolve) => setTimeout(resolve, 800)),
  ]).catch(() => undefined);

  await signOut({ callbackUrl: opts?.callbackUrl ?? '/' });
}
