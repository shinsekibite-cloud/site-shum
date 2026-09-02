import { NextResponse } from 'next/server';
import { requireAdmin, aclJsonError } from '@/lib/acl';
import { runReplicaSync } from '@/lib/replica-sync';
import { publicReplicaStatus } from '@/lib/replica-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Manual sync trigger from admin settings. */
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body.dryRun);
    const result = await runReplicaSync({ mode: 'manual', dryRun });
    return NextResponse.json({
      ok: result.ok,
      message: result.message,
      status: publicReplicaStatus(result.config),
      config: {
        ...result.config,
        sharedSecret: result.config.sharedSecret ? '••••••••' : '',
      },
    }, { status: result.ok ? 200 : 409 });
  } catch (e) {
    return aclJsonError(e);
  }
}
