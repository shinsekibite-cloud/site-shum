"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const CollectiblesPanel = dynamic(() => import("@/components/CollectiblesPanel"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
      Загружаем коллекционные карты…
    </div>
  ),
});

type Props = {
  onBalanceChange?: (ecoPoints: number) => void;
};

/**
 * Lazy-mount collectibles only after the user opens the section.
 * Keeps shop equip/buy responsive by not competing for API bandwidth on load.
 */
export default function ShopCollectiblesLazy({ onBalanceChange }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMounted(true);
  }, [open]);

  return (
    <details
      className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none font-bold text-[var(--fg)]">
        Коллекционные карты
        <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
          Откройте, чтобы загрузить карты и обмены. Магазин косметики выше работает независимо.
        </span>
      </summary>
      <div className="mt-3">
        {mounted ? <CollectiblesPanel onBalanceChange={onBalanceChange} /> : null}
      </div>
    </details>
  );
}
