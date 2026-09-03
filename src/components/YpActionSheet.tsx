'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/body-scroll-lock';

export type YpSheetItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
};

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  items: YpSheetItem[];
};

/**
 * Bottom sheet / floating action menu — rounded dark coastal panel.
 * Inspired by mobile social patterns, original Sochi branding (teal icons).
 */
export default function YpActionSheet({ open, title, onClose, items }: Props) {
  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      unlockBodyScroll();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="yp-sheet" role="presentation">
      <button type="button" className="yp-sheet__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="yp-sheet__panel" role="dialog" aria-modal="true" aria-label={title || 'Меню'}>
        <div className="yp-sheet__grab" aria-hidden />
        {title ? (
          <div className="yp-sheet__head">
            <strong>{title}</strong>
            <button type="button" className="yp-sheet__close" onClick={onClose} aria-label="Закрыть">
              <X size={18} />
            </button>
          </div>
        ) : null}
        <ul className="yp-sheet__list">
          {items.map((item) => {
            const className = `yp-sheet__item${item.danger ? ' is-danger' : ''}${item.disabled ? ' is-disabled' : ''}`;
            const content = (
              <>
                {item.icon ? <span className="yp-sheet__icon">{item.icon}</span> : null}
                <span className="yp-sheet__label">{item.label}</span>
              </>
            );
            if (item.href && !item.disabled) {
              return (
                <li key={item.id}>
                  <a
                    href={item.href}
                    className={className}
                    onClick={() => {
                      item.onClick?.();
                      onClose();
                    }}
                  >
                    {content}
                  </a>
                </li>
              );
            }
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={className}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    item.onClick?.();
                    onClose();
                  }}
                >
                  {content}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
