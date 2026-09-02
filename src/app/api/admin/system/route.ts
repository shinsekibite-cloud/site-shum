import { NextResponse } from 'next/server';
import { requireAdmin, aclJsonError, AclError } from '@/lib/acl';
import { collectServerStatus } from '@/lib/server-metrics';
import { assertModuleEnabled, ModuleDisabledError, moduleDisabledJson } from '@/lib/module-flags';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await requireAdmin();
    await assertModuleEnabled('server_status', session.user.role);
    const data = await collectServerStatus();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof AclError) return aclJsonError(e);
    if (e instanceof ModuleDisabledError) {
      return NextResponse.json(moduleDisabledJson(e.key), { status: 503 });
    }
    console.error('GET /api/admin/system', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Не удалось собрать статус сервера' },
      { status: 500 }
    );
  }
}
