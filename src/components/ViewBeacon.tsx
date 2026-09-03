'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import { collectDeviceFingerprint } from '@/lib/device-fingerprint';
import { useVoiceCopy } from '@/components/VoiceProvider';

type ContentViewType = 'PROJECT' | 'CLUB' | 'NEWS' | 'PLACE' | 'EVENT' | 'GAME';

type Props = {
  type: ContentViewType;
  id: string;
  /** SSR initial count */
  initialCount?: number;
  className?: string;
  style?: React.CSSProperties;
};

export default function ViewBeacon({ type, id, initialCount = 0, className, style }: Props) {
  const [count, setCount] = useState(initialCount);
  const sent = useRef(false);
  const viewsWord = useVoiceCopy('views.label', 'просмотры');

  useEffect(() => {
    if (!id || sent.current) return;
    sent.current = true;
    let cancelled = false;
    (async () => {
      try {
        const deviceId = await collectDeviceFingerprint();
        const res = await fetch('/api/views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, id, deviceId }),
          credentials: 'same-origin',
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && typeof data.viewCount === 'number') {
          setCount(data.viewCount);
        }
        if (!cancelled && data?.ecoAwarded > 0 && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('yp:eco-awarded', {
              detail: { amount: data.ecoAwarded, reason: 'view_unique' },
            })
          );
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, id]);

  const label = count <= 0 ? viewsWord : `${count} ${viewsWord}`;

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#64748b', ...style }}
      title="Уникальные просмотры (1 устройство / аккаунт)"
    >
      <Eye size={14} aria-hidden />
      <span>{label}</span>
    </span>
  );
}
