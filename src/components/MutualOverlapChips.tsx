'use client';

import Link from 'next/link';
import type { MutualOverlap } from '@/lib/social';

type Props = {
  overlap?: MutualOverlap | null;
  compact?: boolean;
  className?: string;
};

export default function MutualOverlapChips({ overlap, compact, className = '' }: Props) {
  if (!overlap) return null;
  const clubs = overlap.clubs || [];
  const projects = overlap.projects || [];
  const spaces = overlap.spaces || [];
  const interests = overlap.interests || [];
  if (!clubs.length && !projects.length && !spaces.length && !interests.length) {
    return null;
  }

  return (
    <div className={`mutual-chips${compact ? ' is-compact' : ''} ${className}`.trim()}>
      {clubs.length > 0 ? (
        <div className="mutual-chips__row">
          <span className="mutual-chips__label">Общие клубы</span>
          <div className="mutual-chips__list">
            {clubs.map((c) => (
              <Link key={c.id} href={`/clubs/${encodeURIComponent(c.id)}`} className="mutual-chip is-club">
                {c.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {projects.length > 0 ? (
        <div className="mutual-chips__row">
          <span className="mutual-chips__label">Общие проекты</span>
          <div className="mutual-chips__list">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${encodeURIComponent(p.id)}`}
                className="mutual-chip is-project"
              >
                {p.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {spaces.length > 0 ? (
        <div className="mutual-chips__row">
          <span className="mutual-chips__label">Общие пространства</span>
          <div className="mutual-chips__list">
            {spaces.map((s) => (
              <Link
                key={s.id}
                href={`/spaces/${encodeURIComponent(s.id)}`}
                className="mutual-chip is-space"
              >
                {s.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {interests.length > 0 ? (
        <div className="mutual-chips__row">
          <span className="mutual-chips__label">Общие интересы</span>
          <div className="mutual-chips__list">
            {interests.map((tag) => (
              <span key={tag} className="mutual-chip is-tag">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
