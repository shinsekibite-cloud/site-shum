'use client';

/**
 * Cookie / PWA / instructions sheet — same scroll-lock + a11y as Modal.
 * Mobile-first bottom sheet variant of the unified overlay system.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/body-scroll-lock';

type Props = {
  ariaLabel: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  zIndex?: number;
  className?: string;
  onDismiss?: () => void;
};

export default function OnboardingSheet({
  ariaLabel,
  icon,
  title,
  children,
  actions,
  zIndex = 10050,
  className = '',
  onDismiss,
}: Props) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onDismiss) {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unlockBodyScroll();
      window.removeEventListener('keydown', onKey);
    };
  }, [onDismiss]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={titleId}
      className={`yp-onboard-sheet allow-select ${className}`.trim()}
      style={{ zIndex }}
    >
      <div className="yp-onboard-sheet__icon" aria-hidden>
        {icon}
      </div>
      <div className="yp-onboard-sheet__body">
        <div id={titleId} className="yp-onboard-sheet__title">
          {title}
        </div>
        <div className="yp-onboard-sheet__text">{children}</div>
        <div className="yp-onboard-sheet__actions">{actions}</div>
      </div>
    </div>
  );
}
