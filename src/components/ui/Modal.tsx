'use client';

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/body-scroll-lock';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** confirm ≈ 480–560px; form ≈ 640px */
  size?: 'confirm' | 'form' | 'wide';
  className?: string;
  /** When false, overlay click does not close (rare). Default true. */
  closeOnOverlay?: boolean;
  zIndex?: number;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Unified modal dialog: portal, scrim, focus trap, Escape, scroll-lock.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'confirm',
  className = '',
  closeOnOverlay = true,
  zIndex = 11000,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    lockBodyScroll();

    const panel = panelRef.current;
    const focusFirst = () => {
      const nodes = panel
        ? (Array.from(panel.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter(
            (el) => el.getClientRects().length > 0
          )
        : [];
      (nodes[0] || panel)?.focus();
    };
    const t = window.requestAnimationFrame(focusFirst);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = (Array.from(panel.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter(
        (el) => el.getClientRects().length > 0
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || (active && !panel.contains(active))) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(t);
      window.removeEventListener('keydown', onKey);
      unlockBodyScroll();
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const onOverlayClick = (e: ReactMouseEvent) => {
    if (!closeOnOverlay) return;
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className={`yp-modal${className ? ` ${className}` : ''}`}
      style={{ zIndex }}
      role="presentation"
      onMouseDown={onOverlayClick}
    >
      <div className="yp-modal__scrim" aria-hidden />
      <div
        ref={panelRef}
        className={`yp-modal__panel yp-modal__panel--${size} allow-select`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="yp-modal__head">
          <h2 id={titleId} className="yp-modal__title">
            {title}
          </h2>
          <button type="button" className="yp-modal__close" onClick={onClose} aria-label="Закрыть">
            <X size={20} aria-hidden />
          </button>
        </header>
        <div className="yp-modal__body">{children}</div>
        {footer ? <footer className="yp-modal__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
}
