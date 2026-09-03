import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import DashboardCharts from '@/components/DashboardCharts';
import { Users, LayoutDashboard, CheckSquare, CalendarDays, MapPin, BarChart3, ScanLine, Trophy, ShieldAlert, Bell, Leaf, Bot, CalendarRange, Server } from 'lucide-react';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { hasPermission, parsePermissions } from '@/lib/acl';
import { redirect } from 'next/navigation';
import { formatMskTimeRange } from '@/lib/booking-hours';

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login?callbackUrl=/admin');
  const role = session.user.role || '';
  if (role !== 'ADMIN' && role !== 'MODERATOR') redirect('/dashboard');

  const perms = parsePermissions(session.user.permissions);
  const can = (key: Parameters<typeof hasPermission>[2]) => hasPermission(role, session.user.permissions, key);
  const isAdmin = role === 'ADMIN';

  const [
    pendingApplicationsCount,
    projectsCount,
    clubsCount,
    usersCount,
    spacesCount,
    pendingBookingsCount,
    recentApplications,
    todayEvents,
    applicationsGroup,
    modReviewers,
    openModerationCount,
    unreadNotifCount,
    weekEventsCount,
    ecoSpenders,
    linkedMessengers,
  ] = await Promise.all([
    can('applications')
      ? prisma.application.count({ where: { status: 'PENDING' } })
      : Promise.resolve(0),
    can('projects') ? prisma.project.count() : Promise.resolve(0),
    can('clubs') ? prisma.club.count() : Promise.resolve(0),
    isAdmin ? prisma.user.count({ where: { deletedAt: null } }) : Promise.resolve(0),
    can('spaces') ? prisma.space.count() : Promise.resolve(0),
    can('bookings')
      ? prisma.booking.count({ where: { status: 'PENDING', endTime: { gte: new Date() } } })
      : Promise.resolve(0),
    can('applications')
      ? prisma.application.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, email: true, phone: true, image: true, role: true } },
            project: true,
            club: true,
            program: true,
          },
        })
      : Promise.resolve([]),
    can('bookings')
      ? prisma.booking.findMany({
          where: {
            status: 'APPROVED',
            startTime: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          },
          include: {
            space: true,
            user: { select: { id: true, name: true, email: true, phone: true, image: true, role: true } },
            participants: true,
          },
        })
      : Promise.resolve([]),
    can('applications')
      ? prisma.application.groupBy({ by: ['status'], _count: true })
      : Promise.resolve([]),
    can('moderation')
      ? prisma.contentFlag.groupBy({
          by: ['reviewedById'],
          where: {
            reviewedById: { not: null },
            reviewedAt: { gte: new Date(Date.now() - 30 * 86400000) },
            status: { in: ['REVIEWED', 'ACTIONED', 'DISMISSED'] },
          },
          _count: { _all: true },
          orderBy: { _count: { reviewedById: 'desc' } },
          take: 5,
        })
      : Promise.resolve([]),
    can('moderation')
      ? prisma.contentFlag.count({ where: { status: 'OPEN' } })
      : Promise.resolve(0),
    isAdmin
      ? prisma.userNotification.count({ where: { readAt: null } })
      : Promise.resolve(0),
    can('bookings')
      ? prisma.booking.count({
          where: {
            status: 'APPROVED',
            startTime: {
              gte: new Date(Date.now() - 7 * 86400000),
              lte: new Date(Date.now() + 7 * 86400000),
            },
          },
        })
      : Promise.resolve(0),
    isAdmin
      ? prisma.user.count({ where: { ecoPoints: { gt: 0 }, deletedAt: null } })
      : Promise.resolve(0),
    isAdmin
      ? prisma.user.count({
          where: {
            deletedAt: null,
            OR: [{ telegramChatId: { not: null } }, { maxUserId: { not: null } }],
          },
        })
      : Promise.resolve(0),
  ]);

  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  });

  let userStats = last7Days.map((date) => ({ date, count: 0 }));
  if (isAdmin) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentUsers = await prisma.user.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, role: { not: 'TECH' } },
      select: { createdAt: true },
    });
    userStats = last7Days.map((dateStr) => {
      const count = recentUsers.filter(
        (u) =>
          u.createdAt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) === dateStr
      ).length;
      return { date: dateStr, count };
    });
  }

  const reviewerIds = modReviewers
    .map((r) => r.reviewedById)
    .filter((id): id is string => Boolean(id));
  const reviewerUsers = reviewerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true, nickname: true },
      })
    : [];
  const reviewerMap = new Map(reviewerUsers.map((u) => [u.id, u]));
  const hallOfFame = modReviewers.map((r, i) => {
    const u = r.reviewedById ? reviewerMap.get(r.reviewedById) : null;
    return {
      rank: i + 1,
      name: u?.nickname || u?.name || 'Модератор',
      count: r._count._all,
      userId: r.reviewedById,
    };
  });

  const appStats = applicationsGroup.map((group) => {
    let name = 'Ожидает';
    let color = '#f59e0b';
    if (group.status === 'APPROVED') {
      name = 'Одобрено';
      color = '#10b981';
    }
    if (group.status === 'REJECTED') {
      name = 'Отклонено';
      color = '#ef4444';
    }
    return { name, value: group._count, color };
  });

  const kpiCards: Array<{
    href: string;
    label: string;
    value: number;
    icon: typeof CheckSquare;
    emphasize?: boolean;
  }> = [];
  if (can('applications')) {
    kpiCards.push({
      href: '/admin/applications?status=PENDING',
      label: 'Заявки',
      value: pendingApplicationsCount,
      icon: CheckSquare,
      emphasize: pendingApplicationsCount > 0,
    });
  }
  if (can('projects')) {
    kpiCards.push({ href: '/admin/projects', label: 'Проекты', value: projectsCount, icon: LayoutDashboard });
  }
  if (can('clubs')) {
    kpiCards.push({ href: '/admin/clubs', label: 'Клубы', value: clubsCount, icon: Users });
  }
  // Admin already sees usersCount in the pulse strip — skip duplicate KPI tile.
  if (can('spaces')) {
    kpiCards.push({ href: '/admin/spaces', label: 'Пространства', value: spacesCount, icon: MapPin });
  }
  if (can('bookings')) {
    kpiCards.push({
      href: '/admin/bookings?status=PENDING',
      label: 'Мероприятия',
      value: pendingBookingsCount,
      icon: CalendarDays,
      emphasize: pendingBookingsCount > 0,
    });
  }
  if (can('bookings')) {
    kpiCards.push({
      href: '/admin/bookings?status=APPROVED',
      label: 'События ±7 дней',
      value: weekEventsCount,
      icon: CalendarRange,
    });
  }
  if (isAdmin) {
    kpiCards.push({
      href: '/admin/users',
      label: 'С мбаллами',
      value: ecoSpenders,
      icon: Leaf,
    });
    kpiCards.push({
      href: '/admin/bots',
      label: 'Мессенджеры',
      value: linkedMessengers,
      icon: Bot,
    });
    kpiCards.push({
      href: '/admin',
      label: 'Непрочит. уведомл.',
      value: unreadNotifCount,
      icon: Bell,
      emphasize: unreadNotifCount > 20,
    });
  }

  return (
    <div className="admin-page-shell admin-dash">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .admin-dash-app-row { cursor: pointer; transition: background 0.15s; }
        .admin-dash-app-row:hover { background: #f8fafc; }
        .admin-dash-event-card:hover { background: #f8fafc; }
        .admin-dash__pulse {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0.75rem;
          margin: 0 0 1.1rem;
        }
        .admin-dash__pulse-card {
          padding: 0.9rem 1rem;
          border-radius: 14px;
          background: linear-gradient(145deg, rgba(13,148,136,0.08), rgba(14,165,233,0.06));
          border: 1px solid rgba(13,148,136,0.14);
        }
        .admin-dash__pulse-card strong { display:block; font-size: 1.35rem; font-weight: 800; color: #0f766e; }
        .admin-dash__pulse-card span { font-size: 0.78rem; color: #64748b; font-weight: 600; }
      `,
        }}
      />
      <div className="admin-page-header admin-dash__header">
        <div>
          <div className="admin-escape">
            <Link href="/">← Главная</Link>
            <Link href="/dashboard">Профиль</Link>
          </div>
          <h1>Дашборд</h1>
          <p>
            {isAdmin
              ? 'Сводка активности, модерации и экосистемы портала'
              : `Модератор · права: ${perms.length ? perms.join(', ') : 'не назначены — отметьте разделы у администратора'}`}
          </p>
        </div>
        <div className="admin-dash__actions">
          {isAdmin && (
            <Link href="/admin/system" className="admin-dash__btn" prefetch>
              <Server size={16} /> Сервер
            </Link>
          )}
          {can(['stats', 'bookings']) && (
            <a href="#admin-analytics" className="admin-dash__btn">
              <BarChart3 size={16} /> Статистика
            </a>
          )}
          {can('scanner') && (
            <Link href="/admin/scanner" className="admin-dash__btn admin-dash__btn--primary" prefetch>
              <ScanLine size={16} /> Сканер
            </Link>
          )}
        </div>
      </div>

      {isAdmin ? (
        <div className="admin-dash__pulse" aria-label="Пульс портала">
          <div className="admin-dash__pulse-card">
            <strong>{usersCount}</strong>
            <span>пользователей</span>
          </div>
          <div className="admin-dash__pulse-card">
            <strong>{ecoSpenders}</strong>
            <span>с эко-балансом</span>
          </div>
          <div className="admin-dash__pulse-card">
            <strong>{linkedMessengers}</strong>
            <span>привязали ботов</span>
          </div>
          <div className="admin-dash__pulse-card">
            <strong>{unreadNotifCount}</strong>
            <span>непрочитанных уведомлений</span>
          </div>
        </div>
      ) : null}

      <div className="admin-dash__kpi">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="admin-dash__kpi-card" prefetch>
              <Icon size={28} className="admin-dash__kpi-bg" aria-hidden />
              <span className="admin-dash__kpi-label">{card.label}</span>
              <strong className={card.emphasize ? 'is-hot' : undefined}>{card.value}</strong>
            </Link>
          );
        })}
      </div>

      {can('moderation') ? (
        <div className="admin-card" style={{ padding: '1.15rem 1.25rem', marginBottom: '1rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Trophy size={18} color="#ca8a04" /> Доска почёта администрации
              </h2>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)', fontSize: '0.82rem' }}>
                Разборы модерации за 30 дней
                {openModerationCount > 0 ? ` · открытых флагов: ${openModerationCount}` : ''}
              </p>
            </div>
            <Link
              href="/admin/moderation"
              className="btn btn-secondary"
              style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.82rem' }}
            >
              <ShieldAlert size={15} /> Модерация
            </Link>
          </div>
          {hallOfFame.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem' }}>
              Пока нет разобранных флагов — доска заполнится по мере работы модераторов.
            </p>
          ) : (
            <div className="mod-hof-grid">
              {hallOfFame.map((r) => (
                <div key={r.userId || r.rank} className="mod-hof-card">
                  <span className="mod-hof-rank">#{r.rank}</span>
                  <div>
                    <div style={{ fontWeight: 800 }}>{r.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{r.count} разборов</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {(isAdmin || can('applications')) && (
        <>
          <p className="admin-analytics-hint" style={{ margin: '0 0 0.75rem', color: 'var(--muted)', fontSize: '0.82rem' }}>
            Период меняется без перезагрузки. «Проходы QR» — детальная статистика сканера.
          </p>
          <DashboardCharts userStats={userStats} appStats={appStats} />
        </>
      )}

      {can('bookings') && (
        <div
          style={{
            backgroundColor: 'white',
            padding: '1.25rem',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>События сегодня ({todayEvents.length})</h2>
            <Link
              href="/admin/bookings?status=APPROVED"
              style={{ color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 500 }}
              prefetch
            >
              Все мероприятия &rarr;
            </Link>
          </div>
          {todayEvents.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1rem' }}>
              {todayEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/admin/bookings?status=APPROVED&view=${event.id}`}
                  prefetch
                  style={{
                    display: 'block',
                    padding: '1rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: 'var(--radius-md)',
                    textDecoration: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  className="admin-dash-event-card"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 600 }}>{event.title}</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem' }}>
                      {formatMskTimeRange(event.startTime, event.endTime)} (МСК)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                    Локация: {event.space?.title}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    <span>Записано: {event.participants?.length || 0} чел.</span>
                    <span>Орг: {event.user?.name || 'Без имени'}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '1rem 0' }}>На сегодня ничего не запланировано.</p>
          )}
        </div>
      )}

      {can('applications') && (
        <div style={{ backgroundColor: 'white', padding: '1.25rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Последние заявки</h2>
            <Link
              href="/admin/applications?status=PENDING"
              style={{ color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 500 }}
              prefetch
            >
              Все ожидающие &rarr;
            </Link>
          </div>
          <div className="admin-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  <th style={{ padding: '0.75rem', color: 'var(--muted)', fontSize: '0.9rem' }}>Тип</th>
                  <th style={{ padding: '0.75rem', color: 'var(--muted)', fontSize: '0.9rem' }}>Пользователь</th>
                  <th style={{ padding: '0.75rem', color: 'var(--muted)', fontSize: '0.9rem' }}>Дата</th>
                  <th style={{ padding: '0.75rem', color: 'var(--muted)', fontSize: '0.9rem' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {recentApplications.length > 0 ? (
                  recentApplications.map((app) => (
                    <tr key={app.id} className="admin-dash-app-row" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td data-label="Тип" style={{ padding: '0.75rem', fontSize: '0.95rem' }}>
                        <Link
                          href={`/admin/applications?status=${app.status}&focus=${app.id}${app.project ? '&type=project' : app.club ? '&type=club' : app.program ? '&type=program' : ''}`}
                          style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
                          prefetch
                        >
                          {app.project
                            ? `Проект «${app.project.title}»`
                            : app.club
                              ? `Клуб «${app.club.title}»`
                              : app.program
                                ? `${
                                    app.program.kind === 'GRANT'
                                      ? 'Грант'
                                      : app.program.kind === 'DOBRO'
                                        ? 'Добро'
                                        : 'Самоупр.'
                                  } «${app.program.title}»`
                                : '—'}
                        </Link>
                      </td>
                      <td data-label="Пользователь" style={{ padding: '0.75rem', fontSize: '0.95rem' }}>
                        <Link
                          href={`/admin/applications?status=${app.status}&focus=${app.id}`}
                          style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
                          prefetch
                        >
                          {app.user.name || app.user.email}
                        </Link>
                      </td>
                      <td data-label="Дата" style={{ padding: '0.75rem', fontSize: '0.95rem', color: 'var(--muted)' }}>
                        <Link
                          href={`/admin/applications?status=${app.status}&focus=${app.id}`}
                          style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
                          prefetch
                        >
                          {new Date(app.createdAt).toLocaleDateString()}
                        </Link>
                      </td>
                      <td data-label="Статус" style={{ padding: '0.75rem' }}>
                        <Link
                          href={`/admin/applications?status=${app.status}&focus=${app.id}`}
                          style={{ color: 'inherit', textDecoration: 'none', display: 'inline-block' }}
                          prefetch
                        >
                          <span
                            style={{
                              backgroundColor:
                                app.status === 'PENDING' ? '#fef3c7' : app.status === 'APPROVED' ? '#dcfce7' : '#fee2e2',
                              color:
                                app.status === 'PENDING' ? '#d97706' : app.status === 'APPROVED' ? '#166534' : '#991b1b',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              fontWeight: 500,
                            }}
                          >
                            {app.status === 'PENDING' ? 'Ожидает' : app.status === 'APPROVED' ? 'Одобрено' : 'Отклонено'}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>
                      Нет последних действий
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
