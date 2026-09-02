import { originFromEnv } from '@/lib/site-identity-shared';
/** Geocode addresses for Yandex Maps (rtext needs lat,lon — not free text). */

export type GeoPoint = { lat: number; lon: number; displayName?: string };

type CacheEntry = { point: GeoPoint | null; at: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h

function cacheKey(q: string) {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function geocodeAddress(query: string): Promise<GeoPoint | null> {
  const q = query.trim();
  if (!q) return null;

  const key = cacheKey(q);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.point;

  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '1',
    countrycodes: 'ru',
    addressdetails: '0',
  });

  // Bias toward Sochi / Krasnodar Krai
  params.set('viewbox', '39.2,44.2,40.3,43.3');
  params.set('bounded', '0');

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'User-Agent': `YoungPortal/1.0 (${originFromEnv()}; maps-routing)`,
        Accept: 'application/json',
      },
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      cache.set(key, { point: null, at: Date.now() });
      return null;
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    if (!Array.isArray(data) || !data[0]) {
      cache.set(key, { point: null, at: Date.now() });
      return null;
    }
    const point: GeoPoint = {
      lat: Number(data[0].lat),
      lon: Number(data[0].lon),
      displayName: data[0].display_name,
    };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
      cache.set(key, { point: null, at: Date.now() });
      return null;
    }
    cache.set(key, { point, at: Date.now() });
    return point;
  } catch {
    return null;
  }
}
