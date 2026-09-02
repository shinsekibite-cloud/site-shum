'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import { ArrowRight, Calendar, MapPin, Wallet, Users } from 'lucide-react';
import FilterBar from '@/components/FilterBar';
import EntityCoverImage from '@/components/EntityCoverImage';
import {
  BODY_TYPE_LABELS,
  PROGRAM_KIND_META,
  PROGRAM_STATUS_LABELS,
  formatProgramDate,
  programPublicPath,
  type ProgramKind,
} from '@/lib/programs-ui';
import { programCover } from '@/lib/theme-covers';

export type ProgramListItem = {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  description: string;
  image: string | null;
  status: string;
  organizer: string | null;
  place: string | null;
  amountLabel: string | null;
  bodyType: string | null;
  seats: number | null;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  _count?: { applications: number };
};

export default function ProgramCatalog({
  kind,
  items,
}: {
  kind: ProgramKind;
  items: ProgramListItem[];
}) {
  const sp = useSafeSearchParams();
  const query = (sp.get('q') || '').trim();
  const statusFilter = (sp.get('status') || 'ALL').toUpperCase();
  const filtered = useMemo(() => {
    let list = items.slice();
    if (statusFilter === 'OPEN' || statusFilter === 'CLOSED' || statusFilter === 'ARCHIVED') {
      list = list.filter((i) => i.status === statusFilter);
    }
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          String(i.summary || '').toLowerCase().includes(q) ||
          String(i.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, query, statusFilter]);
  const meta = PROGRAM_KIND_META[kind];

  return (
    <div className="container" style={{ padding: '1.5rem 1rem', minHeight: 'auto' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h1 className="text-gradient" style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
            {meta.title}
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0, maxWidth: 640, lineHeight: 1.55 }}>{meta.listDescription}</p>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 0, maxWidth: '100%' }}>
          <FilterBar placeholder={`Поиск: ${meta.title.toLowerCase()}…`} hideStatus />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.75rem' }}>
        {[
          { id: 'ALL', label: 'Все' },
          { id: 'OPEN', label: 'Открыт набор' },
          { id: 'CLOSED', label: 'Закрытые' },
        ].map((tab) => {
          const active = (statusFilter || 'ALL') === tab.id;
          const params = new URLSearchParams();
          if (tab.id !== 'ALL') params.set('status', tab.id);
          if (query) params.set('q', query);
          const qs = params.toString();
          const href = qs ? `?${qs}` : programPublicPath(kind);
          return (
            <Link
              key={tab.id}
              href={href}
              className="btn"
              style={{
                padding: '0.4rem 0.9rem',
                borderRadius: 999,
                fontSize: '0.85rem',
                fontWeight: 600,
                background: active ? 'var(--primary)' : 'rgba(15,23,42,0.04)',
                color: active ? '#fff' : 'var(--foreground)',
                border: active ? 'none' : '1px solid rgba(15,23,42,0.08)',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem 1.5rem',
            background: 'white',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--muted)',
            border: '1px solid rgba(15,23,42,0.06)',
          }}
        >
          <h3 style={{ color: 'var(--foreground)', marginBottom: '0.5rem' }}>Пока пусто</h3>
          <p style={{ maxWidth: 420, margin: '0 auto' }}>
            {query
              ? 'Ничего не найдено по запросу. Попробуйте другие слова.'
              : `Скоро здесь появятся актуальные ${meta.title.toLowerCase()}. Следите за новостями.`}
          </p>
        </div>
      ) : (
        <div className="grid-cards">
          {filtered.map((item, idx) => {
            const ends = formatProgramDate(item.endsAt);
            const body = item.bodyType ? BODY_TYPE_LABELS[item.bodyType] : null;
            return (
              <Link
                key={item.id}
                href={programPublicPath(kind, item.id)}
                className="catalog-card"
              >
                <div
                  className={`catalog-badge${item.status !== 'OPEN' ? ' status-completed' : ''}`}
                >
                  {PROGRAM_STATUS_LABELS[item.status] || item.status}
                </div>
                <div className="catalog-img-wrap" style={{ position: 'relative' }}>
                  <EntityCoverImage
                    src={programCover(item, idx)}
                    alt={item.title}
                    fallback={programCover(item, idx + 5)}
                    className="catalog-img"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div
                  style={{
                    padding: '1.25rem 1.25rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    flexGrow: 1,
                    gap: '0.65rem',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      lineHeight: 1.3,
                      color: 'var(--foreground)',
                      margin: 0,
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="line-clamp-3"
                    style={{ color: 'var(--muted)', fontSize: '0.95rem', flexGrow: 1, lineHeight: 1.55, margin: 0 }}
                  >
                    {item.summary || item.description.replace(/<[^>]+>/g, '')}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.55rem 0.9rem',
                      fontSize: '0.82rem',
                      color: 'var(--muted)',
                      fontWeight: 500,
                    }}
                  >
                    {item.amountLabel && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Wallet size={14} /> {item.amountLabel}
                      </span>
                    )}
                    {ends && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={14} /> до {ends}
                      </span>
                    )}
                    {item.place && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={14} /> {item.place}
                      </span>
                    )}
                    {typeof item.seats === 'number' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Users size={14} /> мест: {item.seats}
                      </span>
                    )}
                    {body && <span>{body}</span>}
                  </div>
                  <div className="catalog-card-meta">
                    <span style={{ color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 500 }}>
                      {item.organizer || 'Центр развития молодежи Сочи'}
                    </span>
                    <span
                      style={{
                        color: 'var(--primary)',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.95rem',
                      }}
                    >
                      Подробнее <ArrowRight size={16} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
