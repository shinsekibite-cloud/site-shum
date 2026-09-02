'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

type Props = {
  open: boolean;
  onClose: () => void;
  name?: string | null;
  image?: string | null;
  bio?: string | null;
  hobbies?: string[];
  interests?: string[];
  publicHref?: string;
  publicCode?: string | null;
  portfolioHref?: string;
};

export default function ProfilePreviewModal({
  open,
  onClose,
  name,
  image,
  bio,
  hobbies = [],
  interests = [],
  publicHref,
  publicCode,
  portfolioHref,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const tags = [...new Set([...hobbies, ...interests])];

  return (
    <div className="yp-sheet yp-sheet--profile" role="dialog" aria-modal="true" aria-labelledby="profile-preview-title">
      <button type="button" className="yp-sheet__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="yp-sheet__panel">
        <header className="yp-sheet__head">
          <h2 id="profile-preview-title">Как видят профиль</h2>
          <button type="button" className="yp-sheet__close" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>
        <div className="yp-sheet__body profile-preview">
          <div className="profile-preview__hero">
            <UserAvatar image={image} name={name || 'Профиль'} size={72} />
            <div>
              <strong className="profile-preview__name">{name || 'Без имени'}</strong>
              {publicCode ? <p className="profile-preview__id">ID {publicCode}</p> : null}
            </div>
          </div>
          {bio ? <p className="profile-preview__bio">{bio}</p> : <p className="profile-preview__muted">О себе пока не заполнено</p>}
          {tags.length ? (
            <div className="profile-preview__tags">
              {tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          ) : (
            <p className="profile-preview__muted">Хобби и интересы появятся после заполнения</p>
          )}
          <div className="profile-preview__actions">
            {publicHref ? (
              <Link href={publicHref} className="btn btn-primary">
                Открыть страницу
              </Link>
            ) : null}
            {portfolioHref ? (
              <Link href={portfolioHref} className="btn btn-secondary">
                Портфолио
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
