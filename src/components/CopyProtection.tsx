'use client';

import { useEffect } from 'react';

/**
 * Soft copy-protection for public content (copyright notice + deter casual copy).
 * Inputs, textareas, contenteditable, admin, legal docs, and .allow-select remain usable.
 */
export default function CopyProtection({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) {
      document.body.classList.remove('yp-no-copy');
      return;
    }
    document.body.classList.add('yp-no-copy');

    const isAllowed = (el: EventTarget | null) => {
      if (!(el instanceof Element)) return false;
      return Boolean(
        el.closest(
          'input, textarea, select, [contenteditable="true"], .allow-select, .legal-page, .admin-layout-wrapper, code, pre'
        )
      );
    };

    const onContextMenu = (e: MouseEvent) => {
      if (isAllowed(e.target)) return;
      e.preventDefault();
    };
    const onCopy = (e: ClipboardEvent) => {
      if (isAllowed(e.target)) return;
      e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      if (isAllowed(e.target)) return;
      e.preventDefault();
    };
    const onDragStart = (e: DragEvent) => {
      if (isAllowed(e.target)) return;
      e.preventDefault();
    };

    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('dragstart', onDragStart);
    return () => {
      document.body.classList.remove('yp-no-copy');
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('dragstart', onDragStart);
    };
  }, [enabled]);

  return null;
}
