'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, Download, Eye } from 'lucide-react';
import { OFFICIAL_DOC_TYPE_META } from '@/lib/official-documents-shared';

type AwardItem = {
  id: string;
  type: string;
  title: string;
  serialNumber: string;
  issuedAt: string;
};

export default function AwardsPanel() {
  const [items, setItems] = useState<AwardItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/awards', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || data?.message || 'Не удалось загрузить');
        return data as { items?: AwardItem[] };
      })
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p style={{ color: '#b91c1c' }}>{error}</p>;
  }
  if (items == null) {
    return <p style={{ color: 'var(--muted)' }}>Загрузка…</p>;
  }
  if (items.length === 0) {
    return (
      <div className="profile-empty">
        <Award size={22} aria-hidden />
        <p>Пока нет официальных документов. Их выдаёт администрация портала.</p>
        <div className="yp-award-actions">
          <Link href="/dashboard/achievements" className="btn btn-secondary btn-sm">
            Достижения
          </Link>
          <Link href="/dashboard/portfolio" className="btn btn-secondary btn-sm">
            Портфолио
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="yp-award-grid">
      {items.map((d) => (
        <article key={d.id} className="yp-award-card">
          <div className="yp-award-card__type">
            {(OFFICIAL_DOC_TYPE_META as Record<string, { label?: string }>)[d.type]?.label || d.type}
          </div>
          <strong>{d.title}</strong>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            {d.serialNumber} ·{' '}
            {new Date(d.issuedAt).toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
          <div className="yp-award-actions">
            <Link href={`/awards/${d.id}`} className="btn btn-secondary btn-sm">
              <Eye size={14} /> Смотреть
            </Link>
            <a href={`/api/awards/${d.id}/pdf`} className="btn btn-primary btn-sm" target="_blank" rel="noreferrer">
              <Download size={14} /> PDF
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}
