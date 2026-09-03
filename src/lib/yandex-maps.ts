/** Yandex Maps helpers — route links need coordinates (rtext does not accept free-text). */

export type YandexRouteMode = 'auto' | 'mt' | 'pd' | 'bc';

export type MapPoint = { lat: number; lon: number };

const ROUTE_LABELS: Record<YandexRouteMode, string> = {
  auto: 'На авто',
  mt: 'Общественный транспорт',
  pd: 'Пешком',
  bc: 'На велосипеде',
};

export function yandexRouteLabels() {
  return ROUTE_LABELS;
}

function isPoint(p?: MapPoint | null): p is MapPoint {
  return Boolean(p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

/** Site redirect that geocodes address then opens Yandex route */
export function yandexMapsDirectionsUrl(
  address: string,
  mode: YandexRouteMode = 'auto',
  point?: MapPoint | null
) {
  const q = address.trim();
  if (!q && !isPoint(point)) return null;

  if (isPoint(point)) {
    // rtext format: lat,lon (from empty = current location)
    const params = new URLSearchParams({
      rtext: `~${point.lat},${point.lon}`,
      rtt: mode,
    });
    return `https://yandex.ru/maps/?${params.toString()}`;
  }

  const params = new URLSearchParams({ q, mode });
  return `/api/maps/directions?${params.toString()}`;
}

/** Open place pin — prefers coordinates, falls back to text search / geocode redirect */
export function yandexMapsPlaceUrl(address: string, point?: MapPoint | null) {
  const q = address.trim();
  if (!q && !isPoint(point)) return null;

  if (isPoint(point)) {
    // pt / ll use lon,lat
    const params = new URLSearchParams({
      pt: `${point.lon},${point.lat}`,
      z: '16',
      l: 'map',
    });
    return `https://yandex.ru/maps/?${params.toString()}`;
  }

  const params = new URLSearchParams({ q });
  return `/api/maps/place?${params.toString()}`;
}

/** Embeddable map widget */
export function yandexMapsWidgetUrl(address: string, point?: MapPoint | null) {
  const q = address.trim();
  if (isPoint(point)) {
    const params = new URLSearchParams({
      ll: `${point.lon},${point.lat}`,
      pt: `${point.lon},${point.lat}`,
      z: '16',
    });
    return `https://yandex.ru/map-widget/v1/?${params.toString()}`;
  }
  if (!q) return null;
  // text search in widget is unreliable; still better than blank
  const params = new URLSearchParams({ text: q, z: '16' });
  return `https://yandex.ru/map-widget/v1/?${params.toString()}`;
}
