import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { requirePermission, requirePermissionPage } from '@/lib/acl';
import { notifyApplicationStatus } from '@/lib/notifications';
import { promoteToParticipant } from '@/lib/participant';
import AdminPendingButton from '@/components/admin/AdminPendingButton';
import RejectWithReasonForm from '@/components/admin/RejectWithReasonForm';
import AdminFilterTabs from '@/components/admin/AdminFilterTabs';
import AdminFocusTarget from '@/components/admin/AdminFocusTarget';
import type { ApplicationStatus, Prisma } from '@prisma/client';

async function updateStatus(formData: FormData) {
  'use server';
  const session = await requirePermission('applications');
  const id = formData.get('id') as string;
  const statusRaw = formData.get('status') as string;
  if (statusRaw !== 'APPROVED' && statusRaw !== 'REJECTED') return;
  const status = statusRaw;
  const rejectReason =
    status === 'REJECTED'
      ? String(formData.get('rejectReason') || '')
          .trim()
          .slice(0, 1000)
      : null;
  if (status === 'REJECTED' && !rejectReason) return;

  try {
    const application = await prisma.$transaction(async (tx) => {
      const current = await tx.application.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, image: true, role: true } },
          project: true,
          club: true,
          program: true,
        },
      });
      if (!current || current.status !== 'PENDING') return null;
      return tx.application.update({
        where: { id, status: 'PENDING' },
        data: {
          status,
          rejectReason: status === 'REJECTED' ? rejectReason : null,
        },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, image: true, role: true } },
          project: true,
          club: true,
          program: true,
        },
      });
    });

    if (!application) return;

    if (status === 'APPROVED') {
      await promoteToParticipant(application.userId);
    }

    // Don't block UI on SMTP — fire-and-forget after DB commit
    const targetName =
      application.project?.title ||
      application.club?.title ||
      application.program?.title ||
      'Программа';
    if (application.user?.email) {
      void notifyApplicationStatus({
        to: application.user.email,
        userId: application.user.id,
        targetName,
        status,
        rejectReason: application.rejectReason,
      }).catch(() => null);
    }

    void import('@/lib/moderation-outcome')
      .then(({ publishModerationOutcome }) =>
        publishModerationOutcome({
          kind: 'app',
          id: application.id,
          status,
          actorId: session.user.id,
          actorName: session.user.name || session.user.email || 'Админ',
          subject: targetName,
          rejectReason: application.rejectReason,
        })
      )
      .catch(() => null);

    revalidatePath('/admin/applications');
    revalidatePath('/admin');
    revalidatePath('/dashboard');
  } catch (e) {
    console.error('Ошибка обновления', e);
  }
}

type Search = {
  page?: string;
  status?: string;
  type?: string;
  focus?: string;
  q?: string;
};

function buildHref(base: Search, patch: Partial<Search>) {
  const next = { ...base, ...patch };
  const p = new URLSearchParams();
  if (next.status) p.set('status', next.status);
  if (next.type && next.type !== 'all') p.set('type', next.type);
  if (next.q) p.set('q', next.q);
  if (next.focus) p.set('focus', next.focus);
  if (next.page && String(next.page) !== '1') p.set('page', String(next.page));
  const s = p.toString();
  return s ? `?${s}` : '?status=PENDING';
}

export default async function AdminApplications({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermissionPage('applications');
  const resolved = await searchParams;
  const statusParam = (resolved.status || 'PENDING').toUpperCase();
  const typeParam = (resolved.type || 'all').toLowerCase();
  const type =
    typeParam === 'project' ||
    typeParam === 'club' ||
    typeParam === 'program' ||
    typeParam === 'grant' ||
    typeParam === 'dobro' ||
    typeParam === 'self_gov'
      ? typeParam
      : 'all';
  const q = (resolved.q || '').trim();
  const focus = (resolved.focus || '').trim() || null;
  const page = Math.max(1, parseInt(resolved.page || '1', 10) || 1);
  const take = 20;
  const skip = (page - 1) * take;

  let status: ApplicationStatus | 'ALL' =
    statusParam === 'ALL' || statusParam === 'APPROVED' || statusParam === 'REJECTED' || statusParam === 'PENDING'
      ? (statusParam as ApplicationStatus | 'ALL')
      : 'PENDING';
  // Dashboard deep-link: open the status tab of the focused application
  if (focus && !resolved.status) {
    const focused = await prisma.application.findUnique({
      where: { id: focus },
      select: { status: true },
    });
    if (focused) status = focused.status;
  }

  const where: Prisma.ApplicationWhereInput = {};
  if (status !== 'ALL') where.status = status;
  if (type === 'project') where.projectId = { not: null };
  if (type === 'club') where.clubId = { not: null };
  if (type === 'program') where.programId = { not: null };
  if (type === 'grant') where.program = { kind: 'GRANT' };
  if (type === 'dobro') where.program = { kind: 'DOBRO' };
  if (type === 'self_gov') where.program = { kind: 'SELF_GOV' };
  if (q) {
    where.OR = [
      { message: { contains: q, mode: 'insensitive' } },
      { user: { name: { contains: q, mode: 'insensitive' } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { project: { title: { contains: q, mode: 'insensitive' } } },
      { club: { title: { contains: q, mode: 'insensitive' } } },
      { program: { title: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const effectiveStatus = status;

  let applications: any[] = [];
  let total = 0;
  let counts = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    all: 0,
    project: 0,
    club: 0,
    program: 0,
  };
  try {
    const [listTotal, list, byStatus, projectCount, clubCount, programCount] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        include: {
          project: true,
          club: true,
          program: true,
          user: { select: { id: true, name: true, email: true, phone: true, image: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.application.groupBy({ by: ['status'], _count: true }),
      prisma.application.count({ where: { projectId: { not: null } } }),
      prisma.application.count({ where: { clubId: { not: null } } }),
      prisma.application.count({ where: { programId: { not: null } } }),
    ]);
    total = listTotal;
    applications = list;
    for (const g of byStatus) {
      counts[g.status as 'PENDING' | 'APPROVED' | 'REJECTED'] = g._count;
      counts.all += g._count;
    }
    counts.project = projectCount;
    counts.club = clubCount;
    counts.program = programCount;
  } catch {
    applications = [];
  }

  const totalPages = Math.max(1, Math.ceil(total / take));
  const base: Search = {
    status: effectiveStatus,
    type,
    q: q || undefined,
    focus: focus || undefined,
  };

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '6rem' }}>
      <AdminFocusTarget id={focus ? `app-${focus}` : null} />
      <style>{`
        tr[data-focus-flash="1"] td { background: rgba(59,130,246,0.12) !important; transition: background 0.4s; }
      `}</style>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
            Заявки
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: 0 }}>
            Вступление в клубы, проекты и программы · найдено: {total}
          </p>
        </div>
        <a
          href="/api/admin/export?type=applications"
          className="btn btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.5rem',
            borderRadius: '100px',
            boxShadow: '0 4px 12px rgba(59,130,246,0.25)',
          }}
        >
          Экспорт в CSV
        </a>
      </div>

      <AdminFilterTabs
        ariaLabel="Статус заявки"
        items={[
          {
            href: buildHref(base, { status: 'PENDING', page: '1', focus: undefined }),
            label: 'Ожидают',
            count: counts.PENDING,
            active: effectiveStatus === 'PENDING',
            tone: 'warning',
          },
          {
            href: buildHref(base, { status: 'APPROVED', page: '1', focus: undefined }),
            label: 'Одобрено',
            count: counts.APPROVED,
            active: effectiveStatus === 'APPROVED',
            tone: 'success',
          },
          {
            href: buildHref(base, { status: 'REJECTED', page: '1', focus: undefined }),
            label: 'Отклонено',
            count: counts.REJECTED,
            active: effectiveStatus === 'REJECTED',
            tone: 'danger',
          },
          {
            href: buildHref(base, { status: 'ALL', page: '1', focus: undefined }),
            label: 'Все',
            count: counts.all,
            active: effectiveStatus === 'ALL',
            tone: 'muted',
          },
        ]}
      />

      <AdminFilterTabs
        ariaLabel="Тип участия"
        items={[
          {
            href: buildHref(base, { type: 'all', page: '1', focus: undefined }),
            label: 'Все типы',
            active: type === 'all',
          },
          {
            href: buildHref(base, { type: 'project', page: '1', focus: undefined }),
            label: 'Проекты',
            count: counts.project,
            active: type === 'project',
          },
          {
            href: buildHref(base, { type: 'club', page: '1', focus: undefined }),
            label: 'Клубы',
            count: counts.club,
            active: type === 'club',
          },
          {
            href: buildHref(base, { type: 'program', page: '1', focus: undefined }),
            label: 'Программы',
            count: counts.program,
            active: type === 'program' || type === 'grant' || type === 'dobro' || type === 'self_gov',
          },
        ]}
      />

      <form
        method="GET"
        className="card-surface"
        style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.55rem',
          alignItems: 'center',
        }}
      >
        <input type="hidden" name="status" value={effectiveStatus} />
        <input type="hidden" name="type" value={type} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Поиск: имя, email, клуб, проект, программа…"
          className="settings-input"
          style={{ flex: '1 1 220px', minWidth: 0, margin: 0 }}
        />
        <button type="submit" className="btn btn-secondary" style={{ padding: '0.55rem 1rem', fontWeight: 700 }}>
          Найти
        </button>
      </form>

      <div
        style={{
          backgroundColor: 'white',
          padding: '1rem',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
          overflowX: 'auto',
        }}
      >
        <div className="admin-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                <th style={{ padding: '1rem', color: 'var(--muted)' }}>Тип</th>
                <th style={{ padding: '1rem', color: 'var(--muted)' }}>Название</th>
                <th style={{ padding: '1rem', color: 'var(--muted)' }}>Пользователь</th>
                <th style={{ padding: '1rem', color: 'var(--muted)' }}>Сообщение</th>
                <th style={{ padding: '1rem', color: 'var(--muted)' }}>Статус</th>
                <th style={{ padding: '1rem', color: 'var(--muted)', textAlign: 'right' }}>Решение</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr
                  key={app.id}
                  id={`app-${app.id}`}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: focus === app.id ? 'rgba(59,130,246,0.08)' : undefined,
                  }}
                >
                  <td data-label="Тип" style={{ padding: '1rem', fontWeight: 500 }}>
                    {app.project
                      ? 'Проект'
                      : app.club
                        ? 'Клуб'
                        : app.program?.kind === 'GRANT'
                          ? 'Грант'
                          : app.program?.kind === 'DOBRO'
                            ? 'Добро'
                            : app.program?.kind === 'SELF_GOV'
                              ? 'Самоупр.'
                              : 'Программа'}
                  </td>
                  <td data-label="Название" style={{ padding: '1rem' }}>
                    {app.project?.title || app.club?.title || app.program?.title || '—'}
                  </td>
                  <td data-label="Пользователь" style={{ padding: '1rem', color: 'var(--muted)' }}>
                    {app.user?.name || app.user?.email}
                  </td>
                  <td data-label="Сообщение" style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.88rem', maxWidth: 220 }}>
                    {app.message ? (
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {app.message}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label="Статус" style={{ padding: '1rem' }}>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '1rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        backgroundColor:
                          app.status === 'PENDING' ? '#fef3c7' : app.status === 'APPROVED' ? '#dcfce7' : '#fee2e2',
                        color: app.status === 'PENDING' ? '#d97706' : app.status === 'APPROVED' ? '#166534' : '#991b1b',
                      }}
                    >
                      {app.status === 'PENDING' ? 'Ожидает' : app.status === 'APPROVED' ? 'Одобрено' : 'Отклонено'}
                    </span>
                  </td>
                  <td data-label="Решение" style={{ padding: '1rem', textAlign: 'right' }}>
                    {app.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <form action={updateStatus}>
                          <input type="hidden" name="id" value={app.id} />
                          <input type="hidden" name="status" value="APPROVED" />
                          <AdminPendingButton
                            className="btn btn-secondary"
                            style={{ padding: '0.5rem', color: '#166534', backgroundColor: '#dcfce7' }}
                            title="Одобрить"
                            pendingLabel="…"
                          >
                            <Check size={16} />
                          </AdminPendingButton>
                        </form>
                        <RejectWithReasonForm action={updateStatus} id={app.id} />
                      </div>
                    )}
                    {app.status === 'REJECTED' && app.rejectReason ? (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#991b1b', textAlign: 'right', maxWidth: 260, marginLeft: 'auto' }}>
                        {app.rejectReason}
                      </p>
                    ) : null}                  </td>
                </tr>
              ))}
              {applications.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
                    Нет заявок в этом фильтре
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          {page > 1 && (
            <Link
              href={buildHref(base, { page: String(page - 1) })}
              className="btn btn-secondary"
              style={{ padding: '0.5rem 1rem' }}
              prefetch
            >
              Назад
            </Link>
          )}
          <span style={{ padding: '0.5rem 1rem', fontWeight: 600 }}>
            Страница {page} из {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildHref(base, { page: String(page + 1) })}
              className="btn btn-secondary"
              style={{ padding: '0.5rem 1rem' }}
              prefetch
            >
              Вперёд
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
