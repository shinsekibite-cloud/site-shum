import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseReplicaJson } from '@/lib/replica-config';
import { runReplicaSync } from '@/lib/replica-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Cron endpoint for automatic replica sync.
 * Header: Authorization: Bearer $CRON_SECRET  (or ?secret=)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const secret = bearer || url.searchParams.get('secret') || '';
  const expected = process.env.CRON_SECRET || '';
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  const cfg = parseReplicaJson((settings as { replicaJson?: string | null } | null)?.replicaJson);
  if (!cfg.enabled || !cfg.autoSyncEnabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'auto sync off' });
  }

  // Interval gate
  if (cfg.lastSyncAt) {
    const last = Date.parse(cfg.lastSyncAt);
    const minMs = cfg.syncIntervalMin * 60_000;
    if (Number.isFinite(last) && Date.now() - last < minMs * 0.9) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'interval not elapsed',
        lastSyncAt: cfg.lastSyncAt,
        syncIntervalMin: cfg.syncIntervalMin,
      });
    }
  }

  const result = await runReplicaSync({ mode: 'auto' });
  return NextResponse.json({
    ok: result.ok,
    message: result.message,
    lastSyncAt: result.config.lastSyncAt,
    lastSyncStatus: result.config.lastSyncStatus,
  });
}
