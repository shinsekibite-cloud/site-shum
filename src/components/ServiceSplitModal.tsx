'use client';

import { useEffect, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/body-scroll-lock';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  ariaLabel?: string;
  /** Left brand panel content (photos, QR, etc.) */
  aside: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  zIndex?: number;
};

/**
 * Reference-style split modal: brand panel left, content right.
 * Shown once for onboarding / success flows.
 */
export default function ServiceSplitModal({
  open,
  onClose,
  title,
  ariaLabel,
  aside,
  children,
  footer,
  zIndex = 13000,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unlockBodyScroll();
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="svc-modal" style={{ zIndex }} role="presentation">
      <button type="button" className="svc-modal__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        className="svc-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        aria-labelledby={titleId}
      >
        <aside className="svc-modal__aside">{aside}</aside>
        <div className="svc-modal__main">
          <button type="button" className="svc-modal__close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
          <h2 id={titleId} className="svc-modal__title">
            {title}
          </h2>
          <div className="svc-modal__body">{children}</div>
          {footer ? <div className="svc-modal__footer">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
