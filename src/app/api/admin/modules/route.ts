import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {
  MODULE_FLAG_KEYS,
  MODULE_FLAG_META,
  getModuleFlagsBundle,
  setModuleFlags,
  type ModuleFlagKey,
  type ModuleOffMode,
  type ModuleOffModes,
} from '@/lib/module-flags';
import { opsFlagsRateLimiter, rateLimitJson } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/** Accept plain minutes number → ISO deadline; keep free-text otherwise. */
function normalizeMaintenanceEta(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{1,5}$/.test(trimmed)) {
    const minutes = Number(trimmed);
    if (minutes > 0 && minutes <= 60 * 24 * 14) {
      return new Date(Date.now() + minutes * 60_000).toISOString();
    }
  }
  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) {
    return new Date(asDate).toISOString();
  }
  return trimmed.slice(0, 200);
}

async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const { flags, offModes } = await getModuleFlagsBundle();
  const { prisma } = await import('@/lib/prisma');
  const settings = await prisma.siteSettings
    .findUnique({
      where: { id: '1' },
      select: { maintenanceMessage: true, maintenanceEta: true },
    })
    .catch(() => null);
  return NextResponse.json({
    flags,
    offModes,
    maintenanceMessage: settings?.maintenanceMessage || '',
    maintenanceEta: settings?.maintenanceEta || null,
    meta: MODULE_FLAG_KEYS.map((key) => ({
      key,
      ...MODULE_FLAG_META[key],
      enabled: flags[key] !== false,
      offMode: (offModes[key] as ModuleOffMode | undefined) || 'hide',
    })),
  });
}

export async function POST(req: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  if (!(await opsFlagsRateLimiter.checkAsync(`admin-modules:${session.user.id}:${ip}`))) {
    return NextResponse.json(rateLimitJson('Слишком часто'), { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const partial: Partial<Record<ModuleFlagKey, boolean>> = {};
  const offModesPartial: ModuleOffModes = {};

  if (body.allPublic === false) {
    for (const k of MODULE_FLAG_KEYS) {
      if (MODULE_FLAG_META[k].publicKill) {
        partial[k] = false;
        offModesPartial[k] = 'hide';
      }
    }
  } else if (body.allPublic === true) {
    for (const k of MODULE_FLAG_KEYS) {
      if (MODULE_FLAG_META[k].publicKill) partial[k] = true;
    }
  }

  if (body.flags && typeof body.flags === 'object') {
    for (const k of MODULE_FLAG_KEYS) {
      if (typeof body.flags[k] === 'boolean') partial[k] = body.flags[k];
    }
  }

  if (body.offModes && typeof body.offModes === 'object') {
    for (const k of MODULE_FLAG_KEYS) {
      const v = body.offModes[k];
      if (v === 'soon' || v === 'hide') offModesPartial[k] = v;
      else if (v === null) offModesPartial[k] = undefined;
    }
  }

  if (typeof body.maintenanceMessage === 'string' || typeof body.maintenanceEta === 'string') {
    const { prisma } = await import('@/lib/prisma');
    const eta =
      typeof body.maintenanceEta === 'string' ? normalizeMaintenanceEta(body.maintenanceEta) : undefined;
    await prisma.siteSettings.update({
      where: { id: '1' },
      data: {
        ...(typeof body.maintenanceMessage === 'string'
          ? { maintenanceMessage: body.maintenanceMessage.slice(0, 2000) }
          : {}),
        ...(typeof body.maintenanceEta === 'string' ? { maintenanceEta: eta } : {}),
      },
    });
  }

  const result = await setModuleFlags(partial, session.user.id, offModesPartial);
  return NextResponse.json({ ok: true, ...result });
}
