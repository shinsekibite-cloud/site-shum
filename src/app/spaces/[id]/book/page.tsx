import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BookingCalendar from '@/components/BookingCalendar';
import { decodeRouteParam } from '@/lib/route-id';

export const dynamic = 'force-dynamic';

export default async function BookSpacePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const id = decodeRouteParam(resolvedParams.id);
  const [space, settings] = await Promise.all([
    prisma.space.findUnique({
      where: { id },
    }),
    prisma.siteSettings.findUnique({ where: { id: '1' } }),
  ]);

  if (!space || space.status === 'COMPLETED') {
    notFound();
  }

  const settingsHours = settings as {
    bookingOpenTime?: string | null;
    bookingCloseTime?: string | null;
    minBookingHours?: number | null;
  } | null;

  const openTime = settingsHours?.bookingOpenTime || '09:00';
  const closeTime = settingsHours?.bookingCloseTime || '21:00';
  const minBookingHours = settingsHours?.minBookingHours ?? 3;

  return (
    <div className="container" style={{ padding: '2rem 1rem', minHeight: '60vh' }}>
      <div>
        <Link href={`/spaces/${encodeURIComponent(space.id)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted)', fontWeight: 500, fontSize: '0.95rem', textDecoration: 'none', marginBottom: '1.5rem' }}>
          <ArrowLeft size={16} /> Вернуться к пространству
        </Link>

        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--foreground)' }}>
          Бронирование: {space.title}
        </h1>
        <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
          Выберите дату и время для бронирования или присоединяйтесь к открытым мероприятиям.
        </p>

        <div className="booking-page-panel">
          <BookingCalendar
            spaceId={space.id}
            spaceCapacity={space.capacity}
            openTime={openTime}
            closeTime={closeTime}
            minBookingHours={minBookingHours}
          />
        </div>
      </div>
    </div>
  );
}
