import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { isTechRole } from '@/lib/module-flags';
import {
  TOPOLOGY_EDGE_TYPES,
  buildUserTopology,
  type TopologyEdgeType,
} from '@/lib/ops-topology';
import { opsFlagsRateLimiter, rateLimitJson } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isTechRole(session.user.role)) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  if (!(await opsFlagsRateLimiter.checkAsync(`ops-topo:${session.user.id}:${ip}`))) {
    return NextResponse.json(rateLimitJson('Слишком часто'), { status: 429 });
  }

  const url = new URL(req.url);
  const days = Number(url.searchParams.get('days') || 90);
  const maxNodes = Number(url.searchParams.get('maxNodes') || 60);
  const minWeight = Number(url.searchParams.get('minWeight') || 2);
  const typesRaw = (url.searchParams.get('types') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const types = typesRaw.filter((t): t is TopologyEdgeType =>
    (TOPOLOGY_EDGE_TYPES as readonly string[]).includes(t)
  );

  try {
    const data = await buildUserTopology({
      days: Number.isFinite(days) ? days : 90,
      maxNodes: Number.isFinite(maxNodes) ? maxNodes : 60,
      minWeight: Number.isFinite(minWeight) ? minWeight : 2,
      types: types.length ? types : undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    console.error('[ops/topology]', e);
    return NextResponse.json({ message: 'Не удалось построить карту' }, { status: 500 });
  }
}
