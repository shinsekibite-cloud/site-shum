'use client';

import Image from 'next/image';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { isFairyAvatarUrl } from '@/lib/privacy-alias';

type Badge = { label: string; color: string; title?: string };

type UserAvatarProps = {
  name: string | null | undefined;
  image: string | null | undefined;
  size?: number;
  className?: string;
  style?: CSSProperties;
  aliased?: boolean;
  online?: boolean | null;
  showStatus?: boolean;
  /** Achievement-driven frame color */
  frameColor?: string | null;
  frameGlow?: string | null;
  /** Small tier badges around the avatar (max ~3) */
  badges?: Badge[];
};

function initialsNode(
  name: string | null | undefined,
  aliased: boolean | undefined,
  shared: CSSProperties
) {
  return (
    <div
      aria-hidden
      style={{
        ...shared,
        display: 'grid',
        placeItems: 'center',
        background: aliased
          ? 'linear-gradient(135deg, #0f766e, #38bdf8)'
          : 'linear-gradient(135deg, #2563eb, #0ea5e9)',
        color: '#fff',
        fontWeight: 800,
        fontSize: Math.max(12, Math.round((Number(shared.width) || 44) * 0.36)),
        fontFamily: aliased ? "Georgia, 'Times New Roman', serif" : undefined,
      }}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function UserAvatar({
  name,
  image,
  size = 44,
  className,
  style,
  aliased,
  online,
  showStatus,
  frameColor,
  frameGlow,
  badges,
}: UserAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const ring = frameColor || 'rgba(148,163,184,0.45)';
  const shared: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    objectFit: 'cover',
    flex: '0 0 auto',
    border: `3px solid ${ring}`,
    boxShadow: frameGlow ? `0 0 0 3px ${frameGlow}` : undefined,
    ...style,
  };

  const dot =
    showStatus && online != null ? (
      <span
        aria-hidden
        title={online ? 'в сети' : 'не в сети'}
        style={{
          position: 'absolute',
          right: Math.max(0, Math.round(size * 0.02)),
          bottom: Math.max(0, Math.round(size * 0.02)),
          width: Math.max(8, Math.round(size * 0.22)),
          height: Math.max(8, Math.round(size * 0.22)),
          borderRadius: '50%',
          background: online ? '#22c55e' : '#94a3b8',
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px rgba(15,23,42,0.08)',
          zIndex: 2,
        }}
      />
    ) : null;

  const badgeNodes =
    badges && badges.length > 0 ? (
      <span className="avatar-badge-under" aria-hidden>
        {badges.slice(0, 3).map((b, i) => (
          <span
            key={`${b.label}-${i}`}
            className="avatar-badge avatar-badge--under"
            title={b.title || b.label}
            style={{ background: b.color }}
          >
            {b.label}
          </span>
        ))}
      </span>
    ) : null;

  const wrap = (node: ReactNode) => (
    <span
      className={`user-avatar-wrap${badges?.length ? ' has-under-badges' : ''}${className ? ` ${className}` : ''}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: badges?.length ? 4 : 0,
        width: size,
        flex: '0 0 auto',
      }}
    >
      <span style={{ position: 'relative', width: size, height: size, display: 'inline-flex' }}>
        {node}
        {dot}
      </span>
      {badgeNodes}
    </span>
  );

  const showImage = Boolean(image) && !imgFailed;

  if (showImage && image) {
    if (isFairyAvatarUrl(image) || image.endsWith('.svg')) {
      return wrap(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          width={size}
          height={size}
          style={shared}
          onError={() => setImgFailed(true)}
        />
      );
    }
    // Uploads are often served by nginx from a shared volume; the in-container
    // optimizer can 400 ("isn't a valid image") when the file isn't on this mount.
    const isUpload = image.startsWith('/uploads/') || image.includes('/uploads/');
    return wrap(
      <Image
        src={image}
        alt=""
        width={size}
        height={size}
        style={shared}
        unoptimized={isUpload || image.startsWith('data:') || image.startsWith('http')}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return wrap(initialsNode(name, aliased, shared));
}
