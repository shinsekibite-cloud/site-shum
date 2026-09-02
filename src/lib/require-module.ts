/** Tiny helper for API routes — return 503 Response if module disabled. */
import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import {
  assertModuleEnabled,
  ModuleDisabledError,
  moduleDisabledJson,
  type ModuleFlagKey,
} from '@/lib/module-flags';

export async function rejectIfModuleDisabled(key: ModuleFlagKey) {
  const session = await getServerSession(authOptions);
  try {
    await assertModuleEnabled(key, session?.user?.role);
    return null;
  } catch (e) {
    if (e instanceof ModuleDisabledError) {
      return NextResponse.json(moduleDisabledJson(key), { status: 503 });
    }
    throw e;
  }
}
