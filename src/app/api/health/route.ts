import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { APP_VERSION } from '@/lib/app-version';

export const dynamic = 'force-dynamic';

/** Deep health: process + DB readiness + product version */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const settings = await prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: { siteName: true, maintenanceMode: true },
    });
    return NextResponse.json(
      {
        ok: true,
        db: true,
        version: APP_VERSION,
        maintenanceMode: Boolean(settings?.maintenanceMode),
        siteName: settings?.siteName || null,
        uptimeSec: Math.floor(process.uptime()),
        latencyMs: Date.now() - started,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        db: false,
        version: APP_VERSION,
        error: 'db_unavailable',
        latencyMs: Date.now() - started,
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
