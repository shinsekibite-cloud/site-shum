'use client';

import { Check, Share2 } from 'lucide-react';
import { useState } from 'react';

type Props = {
  title: string;
  variant?: 'hero' | 'inline';
};

export default function PlaceShareButton({ title, variant = 'hero' }: Props) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (navigator.share) {
      try {
        await navigator.share({ title: title || 'Куда сходить в Сочи', url });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      className={`places-cta ${variant === 'hero' ? 'places-cta--hero' : ''} ${copied ? 'is-ok' : ''}`}
      onClick={share}
    >
      {copied ? <Check size={18} /> : <Share2 size={18} />}
      {copied ? 'Ссылка скопирована' : 'Поделиться'}
    </button>
  );
}
