import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Check, X, Users, X as XIcon } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { requirePermission, requirePermissionPage } from '@/lib/acl';
import { notifyBookingStatus } from '@/lib/notifications';
import { promoteToParticipant } from '@/lib/participant';
import { formatMskDate, formatMskTimeRange } from '@/lib/booking-hours';
import AdminPendingButton from '@/components/admin/AdminPendingButton';
import RejectWithReasonForm from '@/components/admin/RejectWithReasonForm';
import AdminFilterTabs from '@/components/admin/AdminFilterTabs';
import type { Prisma } from '@prisma/client';

async function updateStatus(formData: FormData) {
  'use server';
  const session = await requirePermission('bookings');
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
    const booking = await prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({
        where: { id },
        include: {
          space: true,
          user: { select: { id: true, name: true, email: true, phone: true, image: true, role: true } },
        },
      });
      if (!current || current.status !== 'PENDING') return null;

      if (status === 'APPROVED') {
        const overlap = await tx.booking.findFirst({
          where: {
            spaceId: current.spaceId,
            status: 'APPROVED',
            id: { not: current.id },
            startTime: { lt: current.endTime },
            endTime: { gt: current.startTime },
          },
        });
        if (overlap) throw new Error('OVERBOOK');
      }

      return tx.booking.update({
        where: { id, status: 'PENDING' },
        data: {
          status,
          rejectReason: status === 'REJECTED' ? rejectReason : null,
        },
        include: {
          space: true,
          user: { select: { id: true, name: true, email: true, phone: true, image: true, role: true } },
        },
      });
    });

    if (!booking) return;

    if (status === 'APPROVED') {
      await promoteToParticipant(booking.userId);
    }

    if (booking.user?.email) {
      void notifyBookingStatus({
        to: booking.user.email,
        userId: booking.userId,
        bookingId: booking.id,
        title: booking.title,
        spaceTitle: booking.space?.title,
        spaceAddress: booking.space?.address,
        startTime: booking.startTime,
        endTime: booking.endTime,
        status,
        rejectReason: booking.rejectReason,
      }).catch(() => null);
    }

    void import('@/lib/moderation-outcome')
      .then(({ publishModerationOutcome }) =>
        publishModerationOutcome({
          kind: 'book',
          id: booking.id,
          status,
          actorId: session.user.id,
          actorName: session.user.name || session.user.email || 'Админ',
          subject: booking.title,
          rejectReason: booking.rejectReason,
        })
      )
      .catch(() => null);

    revalidatePath('/admin/bookings');
    revalidatePath('/admin');
    revalidatePath('/dashboard');
    revalidatePath('/events');
    revalidatePath('/');
  } catch (e: any) {
    console.error('Ошибка обновления', e.message);
  }
}

type Search = { view?: string; tab?: string; status?: string };

function hrefFor(opts: { tab?: string; status?: string; view?: string | null }) {
  const p = new URLSearchParams();
  if (opts.tab === 'archive') p.set('tab', 'archive');
  const status = opts.status || 'PENDING';
  p.set('status', status);
  if (opts.view) p.set('view', opts.view);
  return `?${p.toString()}`;
}

export default async function AdminBookings({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; tab?: string; status?: string }>;
}) {
  await requirePermissionPage('bookings');
  const resolvedParams = await searchParams;
  const viewId = resolvedParams.view || null;
  const activeTab = resolvedParams.tab === 'archive' ? 'archive' : 'active';
  const statusRaw = (resolvedParams.status || 'PENDING').toUpperCase();
  const statusFilter =
    statusRaw === 'ALL' || statusRaw === 'APPROVED' || statusRaw === 'REJECTED' || statusRaw === 'PENDING'
      ? statusRaw
      : 'PENDING';

  const now = new Date();
  const where: Prisma.BookingWhereInput = {};
  if (statusFilter !== 'ALL') where.status = statusFilter;
  if (activeTab === 'archive') {
    where.endTime = { lt: now };
  } else {
    where.endTime = { gte: now };
  }

  let bookings: any[] = [];
  let counts = { PENDING: 0, APPROVED: 0, REJECTED: 0, all: 0 };
  try {
    const timeWhere: Prisma.BookingWhereInput =
      activeTab === 'archive' ? { endTime: { lt: now } } : { endTime: { gte: now } };

    const [list, byStatus] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          space: true,
          user: { select: { id: true, name: true, email: true, phone: true, image: true, role: true } },
          participants: {
            include: { user: { select: { id: true, name: true, email: true, phone: true, image: true, role: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.booking.groupBy({
        by: ['status'],
        where: timeWhere,
        _count: true,
      }),
    ]);
    bookings = list;
    for (const g of byStatus) {
      counts[g.status as 'PENDING' | 'APPROVED' | 'REJECTED'] = g._count;
      counts.all += g._count;
    }
  } catch {
    bookings = [];
  }

  // Modal can open from another filter — fetch targeted booking if missing
  let viewedBooking = viewId ? bookings.find((b) => b.id === viewId) : null;
  if (viewId && !viewedBooking) {
    viewedBooking = await prisma.booking.findUnique({
      where: { id: viewId },
      include: {
        space: true,
        user: { select: { id: true, name: true, email: true, phone: true, image: true, role: true } },
        participants: {
          include: { user: { select: { id: true, name: true, email: true, phone: true, image: true, role: true } } },
        },
      },
    });
  }

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '6rem' }}>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
            Афиша
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: 0 }}>
            Брони пространств = мероприятия афиши (после одобрения). В списке: {bookings.length}
          </p>
        </div>
        <Link href="/scanner" className="btn btn-secondary" style={{ padding: '0.55rem 1.1rem', fontWeight: 700 }}>
          Открыть сканер
        </Link>
      </div>

      <AdminFilterTabs
        ariaLabel="Период"
        items={[
          {
            href: hrefFor({ tab: 'active', status: statusFilter }),
            label: 'Актуальные',
            active: activeTab === 'active',
          },
          {
            href: hrefFor({ tab: 'archive', status: statusFilter }),
            label: 'Архив',
            active: activeTab === 'archive',
            tone: 'muted',
          },
        ]}
      />

      <AdminFilterTabs
        ariaLabel="Статус брони"
        items={[
          {
            href: hrefFor({ tab: activeTab, status: 'PENDING' }),
            label: 'Ожидают',
            count: counts.PENDING,
            active: statusFilter === 'PENDING',
            tone: 'warning',
          },
          {
            href: hrefFor({ tab: activeTab, status: 'APPROVED' }),
            label: 'Одобрено',
            count: counts.APPROVED,
            active: statusFilter === 'APPROVED',
            tone: 'success',
          },
          {
            href: hrefFor({ tab: activeTab, status: 'REJECTED' }),
            label: 'Отклонено',
            count: counts.REJECTED,
            active: statusFilter === 'REJECTED',
            tone: 'danger',
          },
          {
            href: hrefFor({ tab: activeTab, status: 'ALL' }),
            label: 'Все',
            count: counts.all,
            active: statusFilter === 'ALL',
            tone: 'muted',
          },
        ]}
      />

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
                <th style={{ padding: '1rem', color: 'var(--muted)' }}>В афише</th>
                <th style={{ padding: '1rem', color: 'var(--muted)' }}>Организатор</th>
                <th style={{ padding: '1rem', color: 'var(--muted)' }}>Время и место</th>
                <th style={{ padding: '1rem', color: 'var(--muted)' }}>Участники</th>
                <th style={{ padding: '1rem', color: 'var(--muted)' }}>Статус</th>
                <th style={{ padding: '1rem', color: 'var(--muted)', textAlign: 'right' }}>Решение</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td data-label="В афише" style={{ padding: '1rem', fontWeight: 500 }}>
                    {booking.title}
                    {(booking as { category?: string }).category ? (
                      <span
                        style={{
                          display: 'inline-block',
                          marginLeft: 8,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: '#0369a1',
                          background: 'rgba(14,165,233,0.12)',
                          padding: '0.12rem 0.4rem',
                          borderRadius: 999,
                        }}
                      >
                        {(booking as { category?: string }).category}
                      </span>
                    ) : null}
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                      {booking.description}
                    </div>
                  </td>
                  <td data-label="Организатор" style={{ padding: '1rem', color: 'var(--muted)' }}>
                    {booking.user?.name || booking.user?.email}
                  </td>
                  <td data-label="Время и место" style={{ padding: '1rem', color: 'var(--muted)' }}>
                    <div style={{ fontWeight: 500, color: 'var(--foreground)' }}>{booking.space?.title}</div>
                    <div style={{ fontSize: '0.85rem' }}>
                      {formatMskDate(booking.startTime, { day: 'numeric', month: 'short', year: 'numeric' })}{' '}
                      {formatMskTimeRange(booking.startTime, booking.endTime)} (МСК)
                    </div>
                  </td>
                  <td data-label="Участники" style={{ padding: '1rem' }}>
                    {booking.participants?.length > 0 ? (
                      <Link
                        href={hrefFor({ tab: activeTab, status: statusFilter, view: booking.id })}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          color: 'var(--primary)',
                          fontWeight: 500,
                          padding: '0.25rem 0.5rem',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <Users size={16} /> {booking.participants.length}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Нет</span>
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
                          booking.status === 'PENDING'
                            ? '#fef3c7'
                            : booking.status === 'APPROVED'
                              ? '#dcfce7'
                              : '#fee2e2',
                        color:
                          booking.status === 'PENDING'
                            ? '#d97706'
                            : booking.status === 'APPROVED'
                              ? '#166534'
                              : '#991b1b',
                      }}
                    >
                      {booking.status === 'PENDING'
                        ? 'Ожидает'
                        : booking.status === 'APPROVED'
                          ? 'Одобрено'
                          : 'Отклонено'}
                    </span>
                  </td>
                  <td data-label="Решение" style={{ padding: '1rem', textAlign: 'right' }}>
                    {booking.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <form action={updateStatus}>
                          <input type="hidden" name="id" value={booking.id} />
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
                        <RejectWithReasonForm action={updateStatus} id={booking.id} />
                      </div>
                    )}
                    {booking.status === 'REJECTED' && booking.rejectReason ? (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#991b1b', textAlign: 'right', maxWidth: 260, marginLeft: 'auto' }}>
                        {booking.rejectReason}
                      </p>
                    ) : null}                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
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

      {viewedBooking && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal-dialog">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Участники мероприятия</h3>
              <Link
                href={hrefFor({ tab: activeTab, status: statusFilter, view: null })}
                className="yp-modal-close"
                aria-label="Закрыть"
              >
                <XIcon size={18} />
              </Link>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{viewedBooking.title}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                Вместимость: {viewedBooking.space?.capacity} чел. Записалось:{' '}
                {viewedBooking.participants?.length || 0} чел.
              </div>
            </div>

            {viewedBooking.participants?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {viewedBooking.participants.map((p: any) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{p.user?.name || 'Без имени'}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{p.user?.email}</div>
                    </div>
                    {p.user?.phone && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--foreground)' }}>{p.user.phone}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem 0' }}>Пока никто не записался.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
