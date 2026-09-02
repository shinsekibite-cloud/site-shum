'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Lock } from 'lucide-react';
import ApplyButton from '@/components/ApplyButton';
import EntityTeamPanel from '@/components/entity/EntityTeamPanel';

export type RosterPayload = {
  memberCount: number;
  applicationStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  isMember: boolean;
  isStaff: boolean;
  canRevealMembers: boolean;
  members: Array<{
    key: string;
    name: string;
    image: string | null;
    href: string | null;
    aliased: boolean;
  }>;
  showCuratorContact?: boolean;
  curatorContact?: string | null;
};

const cache = new Map<string, Promise<RosterPayload | null>>();

export function loadEntityRoster(kind: 'project' | 'club', id: string) {
  const key = `${kind}:${id}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(`/api/public/entity-roster?kind=${kind}&id=${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  return cache.get(key)!;
}

function useRoster(kind: 'project' | 'club', id: string) {
  const [data, setData] = useState<RosterPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadEntityRoster(kind, id).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, id]);
  return data;
}

export function EntityApplyStatus({
  kind,
  id,
  open,
}: {
  kind: 'project' | 'club';
  id: string;
  open: boolean;
}) {
  const data = useRoster(kind, id);
  const status = data?.applicationStatus || 'NONE';
  if (!open) return null;
  if (status === 'APPROVED') {
    return (
      <span style={{ color: '#86efac', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <CheckCircle size={18} /> {kind === 'club' ? 'Вы участник' : 'Вы в команде'}
      </span>
    );
  }
  if (status === 'PENDING') {
    return <span style={{ color: '#fde68a', fontWeight: 700 }}>Заявка на рассмотрении</span>;
  }
  if (kind === 'project') {
    return <ApplyButton projectId={id} initialStatus={status} />;
  }
  return (
    <a href="#club-apply" className="btn btn-primary club-hero-actions__btn">
      Подать заявку
    </a>
  );
}

export function EntityMembersPanel({
  kind,
  id,
  title,
  memberCount,
  open,
  showApply = true,
}: {
  kind: 'project' | 'club';
  id: string;
  title: string;
  memberCount: number;
  open: boolean;
  showApply?: boolean;
}) {
  const data = useRoster(kind, id);
  const canReveal = Boolean(data?.canRevealMembers);
  const members = data?.members || [];
  const isMember = Boolean(data?.isMember);
  const status = data?.applicationStatus || 'NONE';

  return (
    <>
      <div
        style={{
          background: '#fff',
          padding: '1.1rem 1.15rem',
          borderRadius: 16,
          border: '1px solid rgba(15,23,42,0.06)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>Участники</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 700 }}>
            {data?.memberCount ?? memberCount}
          </span>
        </div>
        {!canReveal ? (
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: '0.75rem 0.85rem',
              borderRadius: 12,
              background: 'rgba(15,23,42,0.03)',
              border: '1px solid rgba(15,23,42,0.06)',
            }}
          >
            <Lock size={18} color="#64748b" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.45 }}>
              Список участников открывается после сбора всех ачивок портала. Сейчас видно только число:{' '}
              <strong style={{ color: 'var(--foreground)' }}>{data?.memberCount ?? memberCount}</strong>.
            </p>
          </div>
        ) : members.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
            Пока никого нет — подайте заявку первым.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {members.map((m) => {
              const avatar = (
                <div
                  title={m.aliased ? `${m.name} (псевдоним)` : m.name}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: m.image
                      ? `center/cover url(${m.image})`
                      : 'linear-gradient(135deg,#2563eb,#0ea5e9)',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    border: '2px solid #fff',
                    boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
                  }}
                >
                  {!m.image && (m.name?.charAt(0) || '?')}
                </div>
              );
              const card = (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    width: 72,
                    textAlign: 'center',
                  }}
                >
                  {avatar}
                  <span
                    style={{
                      fontSize: '0.68rem',
                      lineHeight: 1.25,
                      color: m.aliased ? '#0f766e' : '#334155',
                      fontWeight: 600,
                    }}
                  >
                    {m.name}
                  </span>
                </div>
              );
              return m.href ? (
                <Link key={m.key} href={m.href} style={{ textDecoration: 'none' }}>
                  {card}
                </Link>
              ) : (
                <div key={m.key}>{card}</div>
              );
            })}
          </div>
        )}
        {canReveal && members.some((m) => m.aliased) ? (
          <p style={{ margin: '0.65rem 0 0', fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.4 }}>
            Участники с закрытой конфиденциальностью показаны сказочными псевдонимами.
          </p>
        ) : null}
      </div>

      {isMember ? (
        <EntityTeamPanel
          kind={kind === 'club' ? 'CLUB' : 'PROJECT'}
          entityId={id}
          entityTitle={title}
        />
      ) : null}

      {showApply && open && status !== 'APPROVED' ? (
        <div
          id={kind === 'club' ? 'club-apply' : 'project-apply'}
          style={{
            background: 'linear-gradient(145deg, rgba(37,99,235,0.08), #fff 55%)',
            padding: '1.1rem 1.15rem',
            borderRadius: 16,
            border: '1px solid rgba(37,99,235,0.15)',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.35rem' }}>
            {kind === 'club' ? 'Хотите вступить?' : 'Хотите в команду?'}
          </h3>
          <p style={{ margin: '0 0 0.85rem', color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.45 }}>
            Оставьте заявку — модератор ответит в личном кабинете.
          </p>
          {kind === 'project' ? (
            <ApplyButton projectId={id} initialStatus={status} withMessage />
          ) : (
            <ApplyButton clubId={id} initialStatus={status} withMessage />
          )}
        </div>
      ) : null}
    </>
  );
}

export function EntityCuratorBlock({
  clubId,
  curatorName,
  publicContact,
}: {
  clubId: string;
  curatorName: string | null;
  publicContact: string | null;
}) {
  const data = useRoster('club', clubId);
  const contact = publicContact || data?.curatorContact || null;
  const href = (() => {
    const c = (contact || '').trim();
    if (!c) return null;
    if (c.startsWith('http') || c.startsWith('tg://')) return c;
    if (c.startsWith('@')) return `https://t.me/${c.slice(1)}`;
    if (/^[+\d\s()-]{10,}$/.test(c)) return `tel:${c.replace(/\s/g, '')}`;
    if (c.includes('@') && c.includes('.')) return `mailto:${c}`;
    return null;
  })();

  return (
    <div
      style={{
        background: '#fff',
        padding: '1.1rem 1.15rem',
        borderRadius: 16,
        border: '1px solid rgba(15,23,42,0.06)',
      }}
    >
      <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem' }}>Куратор</h3>
      {curatorName || contact || data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: '#475569', fontSize: '0.92rem' }}>
          <strong style={{ color: 'var(--foreground)' }}>{curatorName || 'Куратор клуба'}</strong>
          {contact ? (
            href ? (
              <a
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel="noopener noreferrer"
                style={{ color: 'var(--primary)', fontWeight: 600 }}
              >
                {contact}
              </a>
            ) : (
              <span>{contact}</span>
            )
          ) : (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.45 }}>
              Контакт скрыт. Он станет доступен после одобрения заявки в клуб.
            </p>
          )}
        </div>
      ) : (
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.45 }}>
          Контакт куратора появится после модерации заявки.
        </p>
      )}
    </div>
  );
}
