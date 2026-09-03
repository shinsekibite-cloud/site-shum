'use client';

/**
 * Soft eco-pool counter — compact, non-intrusive.
 */
import { useEffect, useState } from 'react';
import { Leaf } from 'lucide-react';
import { fetchPublicStatusCached } from '@/lib/public-status-client';

type Pool = {
  visible: boolean;
  total: number;
  held?: number;
  spent?: number;
  remaining?: number;
  showInShop?: boolean;
  showInFooter?: boolean;
};

function fmt(n: number) {
  return n.toLocaleString('ru-RU');
}

export default function EcoPoolHint({
  variant = 'shop',
}: {
  variant?: 'shop' | 'footer' | 'admin';
}) {
  const [pool, setPool] = useState<Pool | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Footer: skip entirely when eco module is off (one shared status fetch)
    const run = async () => {
      if (variant === 'footer') {
        const status = await fetchPublicStatusCached();
        if (cancelled) return;
        if (status?.modules && status.modules.eco === false) return;
      }
      const url = variant === 'admin' ? '/api/admin/eco' : '/api/eco/pool';
      try {
        const r = await fetch(url, { cache: 'default' });
        const raw = await r.text();
        if (!r.ok || cancelled) return;
        let d: (Pool & { pool?: Pool }) | null = null;
        try {
          d = JSON.parse(raw) as Pool & { pool?: Pool };
        } catch {
          return;
        }
        if (!d || cancelled) return;
        if (variant === 'admin' && d.pool) {
          setPool({ ...d.pool, visible: true });
        } else {
          setPool(d as Pool);
        }
      } catch {
        /* ignore */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [variant]);

  if (!pool?.visible && variant !== 'admin') return null;
  if (variant === 'footer' && pool && pool.showInFooter === false) return null;
  if (variant === 'shop' && pool && pool.showInShop === false) return null;
  if (!pool || typeof pool.total !== 'number') return null;

  const held = pool.held ?? 0;
  const spent = pool.spent ?? 0;
  const remaining = pool.remaining ?? Math.max(0, pool.total - held - spent);
  const issued = held + spent;
  const pct = pool.total > 0 ? Math.min(100, Math.round((issued / pool.total) * 100)) : 0;

  if (variant === 'footer') {
    return (
      <p className="eco-pool-hint eco-pool-hint--footer" title="Общий М-пул портала">
        <Leaf size={12} aria-hidden /> М-пул: осталось {fmt(remaining)} из {fmt(pool.total)}
      </p>
    );
  }

  return (
    <div
      className={`eco-pool-hint eco-pool-hint--${variant}`}
      aria-label="М-пул"
    >
      <div className="eco-pool-hint__head">
        <Leaf size={14} aria-hidden />
        <span>М-пул</span>
        <strong>{fmt(remaining)}</strong>
        <span className="eco-pool-hint__muted">осталось</span>
      </div>
      <div className="eco-pool-hint__bar" aria-hidden>
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="eco-pool-hint__meta">
        <span>всего {fmt(pool.total)}</span>
        <span>у участников {fmt(held)}</span>
        <span>потрачено {fmt(spent)}</span>
      </div>
    </div>
  );
}
