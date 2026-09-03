import { prisma } from '@/lib/prisma';
import { DEFAULT_SITE_NAME } from '@/lib/site-identity-shared';
import { isNextBuildPhase } from '@/lib/build-phase';

export type MaintenanceState = {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceEta: string | null;
  siteName: string;
  logoUrl: string | null;
};

const DEFAULT_MESSAGE =
  'Сейчас на портале проводятся технические работы. Мы скоро вернёмся — загляните чуть позже.';

export function canBypassMaintenance(role?: string | null) {
  return role === 'ADMIN' || role === 'MODERATOR' || role === 'SCANNER' || role === 'TECH';
}

export function isMaintenanceBypassPath(pathname: string) {
  if (!pathname) return false;
  const allow = [
    '/maintenance',
    '/ops',
    '/unavailable',
    '/login',
    '/forgot-password',
    '/reset-password',
    '/api/',
    '/_next/',
    '/icons/',
    '/brand/',
    '/uploads/',
    '/covers/',
    '/sw.js',
    '/manifest.webmanifest',
    '/offline.html',
    '/favicon.ico',
    '/pdf.worker.min.mjs',
    '/pdfjs/',
    '/presentation',
    '/downloads/',
  ];
  return allow.some((p) => pathname === p || pathname.startsWith(p));
}

/** Auth/stub surfaces that must not show site chrome during maintenance */
export function isMaintenanceChromeFreePath(pathname: string) {
  if (!pathname) return false;
  return (
    pathname.startsWith('/maintenance') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password')
  );
}

const MAINTENANCE_TTL_MS = 30_000;
let maintenanceCache: { at: number; data: MaintenanceState } | null = null;

export async function getMaintenanceState(): Promise<MaintenanceState> {
  if (isNextBuildPhase()) {
    return {
      maintenanceMode: false,
      maintenanceMessage: DEFAULT_MESSAGE,
      maintenanceEta: null,
      siteName: DEFAULT_SITE_NAME,
      logoUrl: null,
    };
  }
  const now = Date.now();
  if (maintenanceCache && now - maintenanceCache.at < MAINTENANCE_TTL_MS) {
    return maintenanceCache.data;
  }
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: {
        maintenanceMode: true,
        maintenanceMessage: true,
        maintenanceEta: true,
        siteName: true,
        logoUrl: true,
      },
    });
    const data: MaintenanceState = {
      maintenanceMode: !!settings?.maintenanceMode,
      maintenanceMessage: (settings?.maintenanceMessage || '').trim() || DEFAULT_MESSAGE,
      maintenanceEta: settings?.maintenanceEta?.trim() || null,
      siteName: settings?.siteName || DEFAULT_SITE_NAME,
      logoUrl: settings?.logoUrl || null,
    };
    maintenanceCache = { at: now, data };
    return data;
  } catch {
    const fallback: MaintenanceState = {
      maintenanceMode: false,
      maintenanceMessage: DEFAULT_MESSAGE,
      maintenanceEta: null,
      siteName: DEFAULT_SITE_NAME,
      logoUrl: null,
    };
    maintenanceCache = { at: now, data: fallback };
    return fallback;
  }
}
