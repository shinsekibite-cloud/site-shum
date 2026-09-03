'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { isVoicePackId, voiceCopy, type VoicePackId } from '@/lib/voice-packs';
import { applyEcoDomEffects, type EcoLoadout } from '@/lib/eco-loadout';
import { fetchEcoCached, invalidateEcoCache } from '@/lib/user-data-client';
import { useSession } from 'next-auth/react';

type VoiceCtx = {
  loadout: EcoLoadout;
  voiceId: VoicePackId | null;
  t: (key: string, fallback?: string, vars?: Record<string, string | number>) => string;
  refresh: () => void;
  setLoadoutLocal: (loadout: EcoLoadout) => void;
};

type VoiceActions = {
  refresh: () => void;
  setLoadoutLocal: (loadout: EcoLoadout) => void;
};

const Ctx = createContext<VoiceCtx | null>(null);
const ActionsCtx = createContext<VoiceActions | null>(null);

function loadoutKey(loadout: EcoLoadout) {
  return [
    loadout.voice || '',
    loadout.frame || '',
    loadout.badge || '',
    loadout.theme || '',
    loadout.ticket || '',
    loadout.aura || '',
    loadout.banner || '',
    loadout.cursor || '',
  ].join('|');
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [loadout, setLoadout] = useState<EcoLoadout>({});
  const [ready, setReady] = useState(false);
  const lastKey = useRef('');

  const setLoadoutLocal = useCallback((next: EcoLoadout) => {
    setLoadout((prev) => (loadoutKey(prev) === loadoutKey(next) ? prev : next));
  }, []);

  const refresh = useCallback(() => {
    fetchEcoCached(false)
      .then((d) => {
        if (d?.loadout && typeof d.loadout === 'object') {
          setLoadoutLocal(d.loadout as EcoLoadout);
        }
        /* Never wipe loadout on empty/error — that caused theme flicker */
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [setLoadoutLocal]);

  useEffect(() => {
    if (status === 'authenticated') refresh();
    else if (status === 'unauthenticated') setReady(true);
  }, [status, refresh]);

  useEffect(() => {
    if (!ready || typeof document === 'undefined') return;
    const key = loadoutKey(loadout);
    if (key === lastKey.current) return;
    lastKey.current = key;
    /* Defer html data-eco-* writes so shop paint isn't blocked by a CSS recascade. */
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        applyEcoDomEffects(document.documentElement, loadout);
      });
    });
    return () => {
      window.cancelAnimationFrame(outer);
      if (inner) window.cancelAnimationFrame(inner);
    };
  }, [loadout, ready]);

  const voiceId =
    loadout.voice && isVoicePackId(loadout.voice) ? (loadout.voice as VoicePackId) : null;

  const t = useCallback(
    (key: string, fallback?: string, vars?: Record<string, string | number>) =>
      voiceCopy(voiceId, key, fallback, vars),
    [voiceId]
  );

  const actions = useMemo<VoiceActions>(
    () => ({
      refresh: () => {
        invalidateEcoCache();
        refresh();
      },
      setLoadoutLocal,
    }),
    [refresh, setLoadoutLocal]
  );

  const value = useMemo(
    () => ({
      loadout,
      voiceId,
      t,
      refresh: actions.refresh,
      setLoadoutLocal,
    }),
    [loadout, voiceId, t, actions.refresh, setLoadoutLocal]
  );

  return (
    <ActionsCtx.Provider value={actions}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </ActionsCtx.Provider>
  );
}

export function useVoice() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      loadout: {} as EcoLoadout,
      voiceId: null as VoicePackId | null,
      t: (key: string, fallback?: string, vars?: Record<string, string | number>) =>
        voiceCopy(null, key, fallback, vars),
      refresh: () => undefined,
      setLoadoutLocal: (_: EcoLoadout) => undefined,
    };
  }
  return ctx;
}

/** Stable actions — shop can equip without re-rendering on every loadout paint. */
export function useVoiceActions(): VoiceActions {
  const ctx = useContext(ActionsCtx);
  if (!ctx) {
    return {
      refresh: () => undefined,
      setLoadoutLocal: (_: EcoLoadout) => undefined,
    };
  }
  return ctx;
}

export function useVoiceCopy(
  key: string,
  fallback?: string,
  vars?: Record<string, string | number>
) {
  const { t } = useVoice();
  return t(key, fallback, vars);
}
