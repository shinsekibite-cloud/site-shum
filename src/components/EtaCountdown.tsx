'use client';

import { useEffect, useState } from 'react';
import { formatCountdown, parseEtaDeadline } from '@/lib/eta-countdown';

/** Live countdown when ETA is ISO datetime or minutes; otherwise shows raw label. */
export default function EtaCountdown({
  eta,
  prefix = 'Ориентир',
  doneLabel = 'Срок истёк',
}: {
  eta: string | null | undefined;
  prefix?: string;
  doneLabel?: string;
}) {
  const deadline = parseEtaDeadline(eta);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);

  if (!eta) return null;

  if (!deadline) {
    return (
      <p className="maintenance-eta">
        {prefix}: {eta}
      </p>
    );
  }

  const left = deadline.getTime() - now;
  if (left <= 0) {
    return <p className="maintenance-eta">{doneLabel}</p>;
  }

  return (
    <p className="maintenance-eta" aria-live="polite">
      {prefix}: <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCountdown(left)}</strong>
      <span style={{ display: 'block', fontSize: '0.85em', opacity: 0.85, marginTop: 4 }}>
        до {deadline.toLocaleString('ru-RU')}
      </span>
    </p>
  );
}
