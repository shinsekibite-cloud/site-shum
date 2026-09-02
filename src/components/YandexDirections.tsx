'use client';

import { ExternalLink, Navigation, Map as MapIcon } from 'lucide-react';
import {
  yandexMapsDirectionsUrl,
  yandexMapsPlaceUrl,
  yandexMapsWidgetUrl,
  type MapPoint,
  type YandexRouteMode,
} from '@/lib/yandex-maps';

type Props = {
  address?: string | null;
  /** Optional place name prepended for better geocoding, e.g. space title */
  placeName?: string | null;
  /** Pre-resolved coordinates (preferred — Yandex routes need lat/lon) */
  point?: MapPoint | null;
  /** Show iframe map preview */
  showMap?: boolean;
  /** Compact link row only */
  compact?: boolean;
  /** Desktop: route buttons left, large map right */
  splitLayout?: boolean;
  style?: React.CSSProperties;
};

function resolveQuery(address?: string | null, placeName?: string | null) {
  const a = (address || '').trim();
  const n = (placeName || '').trim();
  if (!a && !n) return '';
  // Prefer plain address for geocoding — place titles often confuse Nominatim
  return a || n;
}

export default function YandexDirections({
  address,
  placeName,
  point = null,
  showMap = false,
  compact = false,
  splitLayout = false,
  style,
}: Props) {
  const query = resolveQuery(address, placeName);
  if (!query && !point) return null;

  const directions = yandexMapsDirectionsUrl(query || address || '', 'auto', point);
  const place = yandexMapsPlaceUrl(query || address || '', point);
  const widget = showMap ? yandexMapsWidgetUrl(query || address || '', point) : null;
  if (!directions || !place) return null;

  const modes: { mode: YandexRouteMode; label: string }[] = [
    { mode: 'auto', label: 'Авто' },
    { mode: 'mt', label: 'Транспорт' },
    { mode: 'pd', label: 'Пешком' },
  ];

  if (compact) {
    return (
      <a
        href={directions}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          color: 'var(--primary)',
          fontWeight: 600,
          fontSize: '0.85rem',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          ...style,
        }}
      >
        <Navigation size={14} />
        Маршрут
        <ExternalLink size={12} style={{ opacity: 0.7 }} />
      </a>
    );
  }

  const actions = (
    <div className={splitLayout ? 'yp-directions__actions' : undefined} style={splitLayout ? undefined : {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.45rem',
      alignItems: 'center',
      marginBottom: widget ? '0.75rem' : 0,
    }}>
      <a
        href={directions}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.55rem 0.9rem',
          fontWeight: 600,
          textDecoration: 'none',
          flex: '0 0 auto',
          whiteSpace: 'nowrap',
        }}
      >
        <Navigation size={16} />
        Маршрут
      </a>
      <a
        href={place}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-secondary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.55rem 0.9rem',
          fontWeight: 600,
          textDecoration: 'none',
          flex: '0 0 auto',
          whiteSpace: 'nowrap',
        }}
      >
        <MapIcon size={16} />
        На карте
      </a>
      {modes.map(({ mode, label }) => {
        const href = yandexMapsDirectionsUrl(query || address || '', mode, point);
        if (!href) return null;
        return (
          <a
            key={mode}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              textDecoration: 'none',
              padding: '0.55rem 0.75rem',
              flex: '0 0 auto',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </a>
        );
      })}
    </div>
  );

  const map = widget ? (
    <div className={`yp-map-embed${splitLayout ? ' yp-map-embed--lg' : ''}`}>
      <iframe
        title={`Карта: ${query || address || 'место'}`}
        src={widget}
        width="100%"
        height="100%"
        frameBorder={0}
        allowFullScreen
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 0,
        }}
      />
    </div>
  ) : null;

  if (splitLayout && map) {
    return (
      <div className="yp-directions-split" style={style}>
        {actions}
        {map}
      </div>
    );
  }

  return (
    <div style={{ ...style }}>
      {actions}
      {map}
    </div>
  );
}
