'use client';

import { useMemo, useSyncExternalStore } from 'react';

/**
 * Non-suspending search params for static catalog pages.
 * Next's useSearchParams() forces a Suspense boundary whose fallback
 * ("Загрузка каталога…") can stick forever if the client chunk/hydrate lags.
 * This hook reads window.location and tracks history soft-navigations.
 */

const listeners = new Set<() => void>();
let patched = false;

function notify() {
  listeners.forEach((l) => l());
}

function ensureHistoryPatch() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  const wrap =
    (fn: History['pushState' | 'replaceState']) =>
    function (this: History, ...args: Parameters<History['pushState']>) {
      const ret = fn.apply(this, args);
      queueMicrotask(notify);
      return ret;
    };
  history.pushState = wrap(history.pushState.bind(history));
  history.replaceState = wrap(history.replaceState.bind(history));
  window.addEventListener('popstate', notify);
}

function subscribe(onStoreChange: () => void) {
  ensureHistoryPatch();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSearchSnapshot() {
  return typeof window !== 'undefined' ? window.location.search : '';
}

function getServerSnapshot() {
  return '';
}

/** Drop-in for the common `.get()` / `.toString()` usage of useSearchParams. */
export function useSafeSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribe, getSearchSnapshot, getServerSnapshot);
  return useMemo(() => {
    const raw = search.startsWith('?') ? search.slice(1) : search;
    return new URLSearchParams(raw);
  }, [search]);
}
