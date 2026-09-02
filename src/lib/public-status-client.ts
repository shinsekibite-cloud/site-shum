/**
 * Tiny shared client cache for /api/public/status — many chrome components
 * (BottomNav, Navbar modules, ProfileGuides, EcoPoolHint callers) used to
 * stampede the endpoint on every mount.
 */
type StatusPayload = {
  ok?: boolean;
  maintenanceMode?: boolean;
  modules?: Record<string, boolean>;
  offModes?: Record<string, string>;
  siteName?: string;
  [key: string]: unknown;
};

const TTL_MS = 30_000;
let cache: { at: number; data: StatusPayload } | null = null;
let inflight: Promise<StatusPayload | null> | null = null;

export async function fetchPublicStatusCached(force = false): Promise<StatusPayload | null> {
  const now = Date.now();
  if (!force && cache && now - cache.at < TTL_MS) return cache.data;
  if (inflight) return inflight;

  inflight = fetch('/api/public/status', {
    // Allow browser HTTP cache to honor Cache-Control from the API
    cache: 'default',
  })
    .then(async (r) => {
      if (!r.ok) return cache?.data ?? null;
      const data = (await r.json()) as StatusPayload;
      cache = { at: Date.now(), data };
      return data;
    })
    .catch(() => cache?.data ?? null)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
