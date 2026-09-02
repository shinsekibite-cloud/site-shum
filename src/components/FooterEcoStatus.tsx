'use client';

/**
 * Footer eco pool — common portal pool (remaining / total).
 * Personal balance lives in the cabinet shop — not here.
 */
import { useEffect, useState } from 'react';
import { Leaf } from 'lucide-react';
import { fetchPublicStatusCached } from '@/lib/public-status-client';

type Pool = {
  visible: boolean;
  total: number;
  remaining?: number;
  showInFooter?: boolean;
};

function fmt(n: number) {
  return n.toLocaleString('ru-RU');
}

export default function FooterEcoStatus() {
  const [pool, setPool] = useState<Pool | null>(null);
  const [ecoEnabled, setEcoEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const pub = await fetchPublicStatusCached();
      if (cancelled) return;
      if (pub?.modules && pub.modules.eco === false) {
        setEcoEnabled(false);
        return;
      }
      setEcoEnabled(true);
      try {
        const r = await fetch('/api/eco/pool', { cache: 'default' });
        if (!r.ok || cancelled) return;
        const d = (await r.json()) as Pool;
        if (!cancelled) setPool(d);
      } catch {
        /* ignore */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ecoEnabled) return null;
  if (!pool?.visible || pool.showInFooter === false) return null;

  const remaining = pool.remaining ?? 0;
  const total = Math.max(1, pool.total ?? 0);
  const pct = Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));

  return (
    <div className="site-footer-eco" title="Общий М-пул портала — не ваш личный баланс">
      <div className="site-footer-eco__row">
        <span className="site-footer-eco__icon" aria-hidden>
          <Leaf size={16} />
        </span>
        <div className="site-footer-eco__text">
          <strong>М-пул портала</strong>
          <span>
            осталось {fmt(remaining)} из {fmt(total)} · это не ваш личный баланс
          </span>
        </div>
        <span className="site-footer-eco__pct">{pct}%</span>
      </div>
      <div className="site-footer-eco__bar" aria-hidden>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
