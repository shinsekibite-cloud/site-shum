import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Trash2, Calendar, FileText, MapPin, Shield } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { requireAdmin, requireAdminPage } from '@/lib/acl';
import RoleEditor from '@/components/RoleEditor';
import UserBlockControls from '@/components/admin/UserBlockControls';
import UserKarmaAndLeaControls from '@/components/admin/UserKarmaAndLeaControls';
import AdminPasswordReset from '@/components/admin/AdminPasswordReset';
import { formatMskDateTime } from '@/lib/booking-hours';
import { roleLabelRu } from '@/lib/role-labels';
import { applicationStatusRu, bookingStatusRu } from '@/lib/status-labels-ru';

async function deleteBooking(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = formData.get('id') as string;
  const userId = formData.get('userId') as string;
  try {
    await prisma.booking.delete({ where: { id } });
    revalidatePath(`/admin/users/${userId}`);
  } catch (e) {
    console.error('Ошибка удаления', e);
  }
}

async function deleteApplication(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = formData.get('id') as string;
  const userId = formData.get('userId') as string;
  try {
    await prisma.application.delete({ where: { id } });
    revalidatePath(`/admin/users/${userId}`);
  } catch (e) {
    console.error('Ошибка удаления', e);
  }
}

export default async function AdminUserDetails({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const resolvedParams = await params;
  const user = await prisma.user.findUnique({
    where: { id: resolvedParams.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      role: true,
      permissions: true,
      createdAt: true,
      updatedAt: true,
      reliabilityScore: true,
      socialScore: true,
      attendedCount: true,
      noShowCount: true,
      warnCount: true,
      blockedAt: true,
      blockedReason: true,
      suspiciousFlag: true,
      tokenVersion: true,
      bookings: {
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          status: true,
          createdAt: true,
          space: { select: { id: true, title: true, address: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      applications: {
        select: {
          id: true,
          status: true,
          message: true,
          createdAt: true,
          project: { select: { id: true, title: true } },
          club: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      loginEvents: {
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          ip: true,
          userAgent: true,
          fingerprint: true,
          deviceLabel: true,
          kind: true,
          success: true,
          createdAt: true,
        },
      },
      ticketCheckIns: {
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true,
          method: true,
          createdAt: true,
          booking: { select: { title: true, space: { select: { title: true } } } },
        },
      },
    },
  });

  if (!user || user.role === 'TECH') {
    notFound();
  }

  const uniqueIps = [...new Set(user.loginEvents.map((e) => e.ip).filter(Boolean))] as string[];
  const uniqueFp = [...new Set(user.loginEvents.map((e) => e.fingerprint).filter(Boolean))] as string[];

  return (
    <div>
      <div className="admin-page-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <Link href="/admin/users" className="btn btn-secondary" style={{ padding: '0.5rem' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, lineHeight: 1.25, minWidth: 0 }}>
          Профиль: {user.name || 'Без имени'}
        </h1>
        {user.blockedAt && (
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              padding: '0.3rem 0.65rem',
              borderRadius: 8,
              background: 'rgba(220,38,38,0.12)',
              color: '#b91c1c',
            }}
          >
            ЗАБЛОКИРОВАН
          </span>
        )}
      </div>

      <div className="grid-2">
        <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600 }}>Основная информация</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <span style={{ color: 'var(--muted)' }}>ID:</span> {user.id}
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Email:</span> {user.email || '—'}
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Телефон:</span> {user.phone || '—'}
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Роль:</span> {roleLabelRu(user.role)}
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Авторитет:</span>{' '}
              <strong>{user.reliabilityScore ?? 100}%</strong>
              <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                {' '}
                (пришёл {user.attendedCount ?? 0}, пропусков {user.noShowCount ?? 0})
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Социальный рейтинг:</span>{' '}
              <strong>{(user as { socialScore?: number }).socialScore ?? 50}%</strong>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Дата регистрации:</span>{' '}
              {new Date(user.createdAt).toLocaleDateString('ru-RU')}
            </div>
          </div>
        </div>

        <RoleEditor user={{ id: user.id, role: user.role, permissions: user.permissions }} />
      </div>

      <div className="grid-2" style={{ marginTop: '1rem' }}>
        <UserBlockControls
          userId={user.id}
          blockedAt={user.blockedAt}
          blockedReason={user.blockedReason}
          suspiciousFlag={user.suspiciousFlag}
        />

        <UserKarmaAndLeaControls
          userId={user.id}
          reliabilityScore={user.reliabilityScore}
          socialScore={(user as { socialScore?: number }).socialScore ?? 50}
          warnCount={user.warnCount}
        />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <AdminPasswordReset userId={user.id} email={user.email} />
      </div>

      <div className="grid-2" style={{ marginTop: '1rem' }}>
        <div
          style={{
            backgroundColor: 'white',
            padding: '1rem',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
            <Shield size={18} style={{ color: 'var(--primary)' }} />
            <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>Техническая информация</h2>
          </div>
          <div style={{ fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <span style={{ color: 'var(--muted)' }}>tokenVersion:</span> {user.tokenVersion}
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Уникальные IP:</span>{' '}
              {uniqueIps.length ? uniqueIps.join(', ') : '—'}
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Отпечатки устройств:</span> {uniqueFp.length || 0}
            </div>
            <div style={{ maxHeight: 360, overflow: 'auto', marginTop: 6 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.85rem' }}>
                История входов (до 200)
                {user.warnCount > 0 ? (
                  <span style={{ marginLeft: 8, color: '#b45309', fontWeight: 650 }}>
                    · предупр. модерации: {user.warnCount}
                  </span>
                ) : null}
              </div>
              {user.loginEvents.length === 0 && (
                <p style={{ color: 'var(--muted)', margin: 0 }}>История входов пока пуста</p>
              )}
              {user.loginEvents.map((e) => (
                <div
                  key={e.id}
                  style={{
                    padding: '0.45rem 0',
                    borderBottom: '1px solid #f1f5f9',
                    fontSize: '0.8rem',
                    color: '#334155',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {e.kind} · {e.deviceLabel || '—'} {e.success ? '' : '(fail)'}
                  </div>
                  <div style={{ color: 'var(--muted)', wordBreak: 'break-all' }}>
                    {e.ip || 'no-ip'}
                    {e.fingerprint ? ` · fp:${e.fingerprint.slice(0, 10)}…` : ''}
                  </div>
                  <div style={{ color: '#94a3b8' }}>{new Date(e.createdAt).toLocaleString('ru-RU')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {user.ticketCheckIns.length > 0 && (
        <div
          style={{
            marginTop: '1rem',
            background: 'white',
            padding: '1rem',
            borderRadius: 14,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.65rem' }}>Последние проходы</h2>
          {user.ticketCheckIns.map((c) => (
            <div key={c.id} style={{ fontSize: '0.88rem', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9' }}>
              {c.booking.title} · {c.booking.space?.title || '—'} · {c.method} ·{' '}
              {new Date(c.createdAt).toLocaleString('ru-RU')}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
        <div
          style={{
            backgroundColor: 'white',
            padding: '1rem',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            gap: '1rem',
            flex: 1,
          }}
        >
          <div
            style={{
              flex: 1,
              backgroundColor: 'rgba(59,130,246,0.1)',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              textAlign: 'center',
            }}
          >
            <Calendar size={24} style={{ color: 'var(--primary)', margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)' }}>{user.bookings.length}</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Бронирований</div>
          </div>
          <div
            style={{
              flex: 1,
              backgroundColor: 'rgba(244,63,94,0.1)',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              textAlign: 'center',
            }}
          >
            <FileText size={24} style={{ color: 'var(--accent)', margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>{user.applications.length}</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Заявок</div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: '2rem' }}>
        <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600 }}>Заявки ({user.applications.length})</h2>
          {user.applications.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>Нет заявок</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {user.applications.map((app) => (
                <div key={app.id} style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <strong>{app.project?.title || app.club?.title || 'Удалено'}</strong>
                    <span style={{ fontSize: '0.8rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f1f5f9' }}>
                      {applicationStatusRu(app.status)}
                    </span>
                  </div>
                  {app.message && (
                    <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>{app.message}</p>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <small style={{ color: 'var(--muted)' }}>{new Date(app.createdAt).toLocaleDateString()}</small>
                    <form action={deleteApplication}>
                      <input type="hidden" name="id" value={app.id} />
                      <input type="hidden" name="userId" value={user.id} />
                      <button type="submit" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>
                        <Trash2 size={16} />
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600 }}>Бронирования ({user.bookings.length})</h2>
          {user.bookings.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>Нет бронирований</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {user.bookings.map((booking) => (
                <div key={booking.id} style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <strong>{booking.title}</strong>
                    <span style={{ fontSize: '0.8rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f1f5f9' }}>
                      {bookingStatusRu(booking.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.5rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <MapPin size={14} /> {booking.space?.title}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <small style={{ color: 'var(--muted)' }}>
                      {formatMskDateTime(booking.startTime, { withYear: true })} (МСК)
                    </small>
                    <form action={deleteBooking}>
                      <input type="hidden" name="id" value={booking.id} />
                      <input type="hidden" name="userId" value={user.id} />
                      <button type="submit" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>
                        <Trash2 size={16} />
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
