import { NextResponse } from 'next/server';
import { requireAdmin, aclJsonError } from '@/lib/acl';
import { queryOnlineUsers } from '@/lib/admin-online-users';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const data = await queryOnlineUsers({
      q: url.searchParams.get('q') || undefined,
      role: url.searchParams.get('role') || undefined,
      status: url.searchParams.get('status') || undefined,
      sort: url.searchParams.get('sort') || undefined,
      order: url.searchParams.get('order') === 'asc' ? 'asc' : 'desc',
      limit: Number(url.searchParams.get('limit') || 100),
    });
    return NextResponse.json(data);
  } catch (e) {
    return aclJsonError(e);
  }
}
