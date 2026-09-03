'use client';

import { useState } from 'react';
import Image from 'next/image';
import { newsCoverUrl } from '@/lib/news-media';
import { newsCover } from '@/lib/theme-covers';

type Props = {
  src?: string | null;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  /** Stable seed for thematic photo fallback (news id/title) */
  seed?: string;
  index?: number;
};

/** News cover with thematic photo fallback when SVG/placeholder/broken. */
export default function NewsCoverImage({
  src,
  alt,
  sizes,
  className,
  priority,
  seed,
  index = 0,
}: Props) {
  const [failed, setFailed] = useState(false);
  const thematic = newsCover({ id: seed || alt, title: alt, imageUrl: src }, index);
  const raw = newsCoverUrl(src);
  const weak = !raw || /\.svg($|\?)/i.test(raw) || /section-news|news-default|uploads\/covers\/news-seed/i.test(raw);
  const url = failed || weak ? thematic : raw;
  const isSvg = /\.svg($|\?)/i.test(url);
  const isUpload = url.startsWith('/uploads/');

  return (
    <Image
      src={url}
      alt={alt}
      fill
      style={{ objectFit: 'cover' }}
      className={className}
      sizes={sizes}
      priority={priority}
      onError={() => setFailed(true)}
      unoptimized={isSvg || isUpload}
    />
  );
}
