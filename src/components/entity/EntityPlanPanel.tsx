import {
  defaultClubRoadmap,
  defaultProjectRoadmap,
  parseRoadmap,
  parseRoles,
  parseTasks,
  type RoadmapItem,
  type RoleItem,
  type TaskItem,
} from '@/lib/entity-plan';
import { CheckCircle2, Circle, ListChecks, Map, Target, Users } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  entityKind: 'project' | 'club';
  entityTitle: string;
  goal?: string | null;
  mission?: string | null;
  roadmapJson?: string | null;
  rolesJson?: string | null;
  tasksJson?: string | null;
};

function roadmapStatusLabel(status?: string) {
  if (status === 'active') return 'В работе';
  if (status === 'done') return 'Готово';
  return 'Запланировано';
}

function roadmapStatusColor(status?: string) {
  if (status === 'active') return { bg: 'rgba(37,99,235,0.12)', color: '#1d4ed8' };
  if (status === 'done') return { bg: 'rgba(34,197,94,0.12)', color: '#15803d' };
  return { bg: 'rgba(100,116,139,0.12)', color: '#475569' };
}

function taskStatusIcon(task: TaskItem) {
  if (task.done || task.status === 'done') {
    return <CheckCircle2 size={18} color="#16a34a" aria-hidden />;
  }
  if (task.status === 'doing') {
    return <Circle size={18} color="#2563eb" aria-hidden />;
  }
  return <Circle size={18} color="#94a3b8" aria-hidden />;
}

function SectionCard({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      style={{
        background: '#fff',
        padding: 'clamp(1.15rem, 3vw, 1.5rem)',
        borderRadius: 16,
        border: '1px solid rgba(15,23,42,0.06)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
      }}
    >
      <h2
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '1.15rem',
          fontWeight: 800,
          margin: '0 0 1rem',
          color: 'var(--foreground)',
        }}
      >
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function EntityPlanSummary({
  goal,
  mission,
}: {
  goal?: string | null;
  mission?: string | null;
}) {
  if (!goal && !mission) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        marginTop: '0.75rem',
        maxWidth: 640,
      }}
    >
      {goal ? (
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.92)', fontSize: '0.95rem', lineHeight: 1.45 }}>
          <strong style={{ fontWeight: 700 }}>Цель:</strong> {goal}
        </p>
      ) : null}
      {mission ? (
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.82)', fontSize: '0.88rem', lineHeight: 1.45 }}>
          {mission}
        </p>
      ) : null}
    </div>
  );
}

export default function EntityPlanPanel({
  entityKind,
  entityTitle,
  goal,
  mission,
  roadmapJson,
  rolesJson,
  tasksJson,
}: Props) {
  const parsedRoadmap = parseRoadmap(roadmapJson);
  const roadmap: RoadmapItem[] =
    parsedRoadmap.length > 0
      ? parsedRoadmap
      : entityKind === 'club'
        ? defaultClubRoadmap(entityTitle)
        : defaultProjectRoadmap(entityTitle);
  const roles: RoleItem[] = parseRoles(rolesJson);
  const tasks: TaskItem[] = parseTasks(tasksJson);
  const usingDefaultRoadmap = parsedRoadmap.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <SectionCard id="entity-goal-mission" title="Цель и миссия" icon={<Target size={20} color="#2563eb" />}>
        {goal || mission ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', color: '#334155', lineHeight: 1.65 }}>
            {goal ? (
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                  Цель
                </div>
                <p style={{ margin: 0, fontSize: '1.02rem' }}>{goal}</p>
              </div>
            ) : null}
            {mission ? (
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                  Миссия
                </div>
                <p style={{ margin: 0, fontSize: '0.98rem' }}>{mission}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem', lineHeight: 1.55 }}>
            Команда уточняет цель и миссию — ниже дорожная карта с ориентирами по умолчанию.
          </p>
        )}
      </SectionCard>

      <SectionCard id="entity-roadmap" title="Дорожная карта" icon={<Map size={20} color="#0f766e" />}>
        {usingDefaultRoadmap ? (
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: '#64748b' }}>
            Стартовый план — команда уточняет этапы по ходу работы.
          </p>
        ) : null}
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {roadmap.map((step, idx) => {
            const badge = roadmapStatusColor(step.status);
            return (
              <li
                key={`${step.title}-${idx}`}
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: 12,
                  background: 'rgba(15,23,42,0.02)',
                  border: '1px solid rgba(15,23,42,0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{step.title}</strong>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '0.2rem 0.55rem',
                      borderRadius: 999,
                      background: badge.bg,
                      color: badge.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {roadmapStatusLabel(step.status)}
                  </span>
                </div>
                {step.due ? (
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>Срок: {step.due}</div>
                ) : null}
                {step.description ? (
                  <p style={{ margin: '0.45rem 0 0', fontSize: '0.88rem', color: '#475569', lineHeight: 1.5 }}>{step.description}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </SectionCard>

      <SectionCard id="entity-roles" title="Команда и роли" icon={<Users size={20} color="#7c3aed" />}>
        {roles.length === 0 ? (
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem', lineHeight: 1.55 }}>
            Роли распределяются по мере вступления участников.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
            {roles.map((r, idx) => (
              <li
                key={`${r.role}-${idx}`}
                style={{
                  padding: '0.75rem 0.9rem',
                  borderRadius: 12,
                  border: '1px solid rgba(15,23,42,0.06)',
                  background: '#fafafa',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a' }}>{r.role}</div>
                {r.name ? (
                  <div style={{ fontSize: '0.82rem', color: '#2563eb', marginTop: 2, fontWeight: 600 }}>{r.name}</div>
                ) : null}
                {r.duties ? (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.86rem', color: '#475569', lineHeight: 1.5 }}>{r.duties}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard id="entity-tasks" title="Задачи" icon={<ListChecks size={20} color="#ea580c" />}>
        {tasks.length === 0 ? (
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem', lineHeight: 1.55 }}>
            Чек-лист задач появится, когда команда его заполнит.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {tasks.map((t, idx) => (
              <li
                key={`${t.title}-${idx}`}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '0.55rem 0',
                  borderBottom: idx < tasks.length - 1 ? '1px solid rgba(15,23,42,0.06)' : undefined,
                }}
              >
                <span style={{ marginTop: 2, flexShrink: 0 }}>{taskStatusIcon(t)}</span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      color: t.done ? '#64748b' : '#0f172a',
                      textDecoration: t.done ? 'line-through' : undefined,
                    }}
                  >
                    {t.title}
                  </div>
                  {t.assigneeName ? (
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>Ответственный: {t.assigneeName}</div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
