'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export type ProjectTab = {
  id: string;
  title: string;
};

export default function ProjectTabs({
  projects,
  activeId,
}: {
  projects: ProjectTab[];
  activeId?: string | null;
}) {
  const router = useRouter();
  if (!projects.length) return null;

  return (
    <div
      role="tablist"
      aria-label="Проекты"
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 4,
        marginBottom: '1.25rem',
        scrollbarWidth: 'thin',
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={!activeId}
        className="btn"
        onClick={() => router.push('/projects')}
        style={{
          flex: '0 0 auto',
          borderRadius: 999,
          padding: '0.45rem 0.95rem',
          fontSize: '0.82rem',
          fontWeight: 700,
          border: !activeId ? '1px solid transparent' : '1px solid rgba(15,23,42,0.1)',
          background: !activeId ? 'var(--primary)' : '#fff',
          color: !activeId ? '#fff' : 'var(--foreground)',
          cursor: 'pointer',
        }}
      >
        Все
      </button>
      {projects.map((p) => {
        const active = p.id === activeId;
        return (
          <Link
            key={p.id}
            href={`/projects?tab=${encodeURIComponent(p.id)}`}
            role="tab"
            aria-selected={active}
            style={{
              flex: '0 0 auto',
              borderRadius: 999,
              padding: '0.45rem 0.95rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              textDecoration: 'none',
              border: active ? '1px solid transparent' : '1px solid rgba(15,23,42,0.1)',
              background: active ? 'var(--primary)' : '#fff',
              color: active ? '#fff' : 'var(--foreground)',
              whiteSpace: 'nowrap',
            }}
          >
            {p.title.replace(/^Проект:\s*/i, '')}
          </Link>
        );
      })}
    </div>
  );
}
