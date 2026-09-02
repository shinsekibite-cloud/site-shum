'use client';

import { useState } from 'react';
import Image from 'next/image';
import { resolveEntityCover, DEFAULT_SECTION_COVER } from '@/lib/theme-covers';

type Props = {
  src?: string | null;
  alt: string;
  /** Thematic fallback when src is empty or fails to load */
  fallback?: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
};

const PLACEHOLDER = '/covers/photo/sochi-sea.jpg';

/** Catalog / event cover with SVG-safe loading and thematic fallback. */
export default function EntityCoverImage({
  src,
  alt,
  fallback,
  sizes,
  className,
  priority,
}: Props) {
  const [failed, setFailed] = useState(false);
  const thematic = fallback || DEFAULT_SECTION_COVER || PLACEHOLDER;
  const url = failed ? resolveEntityCover(null, thematic) : resolveEntityCover(src, thematic);
  const isSvg = /\.svg($|\?)/i.test(url);
  const isUpload = url.startsWith('/uploads/');

  return (
    <Image
      src={url || PLACEHOLDER}
      alt={alt}
      fill
      style={{ objectFit: 'cover' }}
      className={className}
      sizes={sizes || '(max-width: 640px) 100vw, 50vw'}
      priority={priority}
      loading={priority ? undefined : 'lazy'}
      onError={() => setFailed(true)}
      unoptimized={isSvg || isUpload}
    />
  );
}
