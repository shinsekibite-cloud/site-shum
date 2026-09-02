import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import {
  buildOccupancyWeek,
  buildWeekDayKeys,
  nextFreeWindow,
  parseOpenClose,
} from '@/lib/hall-occupancy';
import { spaceCover } from '@/lib/theme-covers';
import EntityCoverImage from '@/components/EntityCoverImage';
import GuestAuthPrompt from '@/components/GuestAuthPrompt';
import { encodeRouteParam } from '@/lib/route-id';
import { isCoworkingSpace } from '@/lib/coworking';
import { isNextBuildPhase } from '@/lib/build-phase';

export default async function FreeNowSpaces({ limit = 4 }: { limit?: number }) {
  // Docker builder has no Postgres — skip Prisma during `next build` prerender.
  if (isNextBuildPhase()) return null;

  const spaces = await prisma.space.findMany({
    where: { status: 'ACTIVE', isDemoData: false },
    orderBy: { updatedAt: 'desc' },
    take: 12,
  });
  if (!spaces.length) return null;

  const settings = await prisma.siteSettings.findUnique({
    where: { id: '1' },
    select: { bookingOpenTime: true, bookingCloseTime: true },
  });
  const dayKeys = buildWeekDayKeys(new Date(), 3);
  const rangeStart = new Date(`${dayKeys[0]}T00:00:00+03:00`);
  const rangeEnd = new Date(`${dayKeys[dayKeys.length - 1]}T23:59:59+03:00`);
  const ids = spaces.map((s) => s.id);

  const [bookings, closures] = await Promise.all([
    prisma.booking.findMany({
      where: {
        spaceId: { in: ids },
        status: { in: ['APPROVED', 'PENDING'] },
        startTime: { lt: rangeEnd },
        endTime: { gt: rangeStart },
      },
      select: {
        id: true,
        spaceId: true,
        title: true,
        startTime: true,
        endTime: true,
        status: true,
        contactMode: true,
      },
    }),
    prisma.spaceClosure.findMany({
      where: {
        spaceId: { in: ids },
        startTime: { lt: rangeEnd },
        endTime: { gt: rangeStart },
      },
      select: { spaceId: true, startTime: true, endTime: true, kind: true, note: true },
    }),
  ]);

  const cards = spaces
    .map((space, idx) => {
      const { openMin, closeMin } = parseOpenClose(
        space.openTime,
        space.closeTime,
        settings?.bookingOpenTime,
        settings?.bookingCloseTime
      );
      const week = buildOccupancyWeek({
        openMin,
        closeMin,
        stepMin: space.slotStepMin === 30 ? 30 : 60,
        dayKeys,
        bookings: bookings.filter((b) => b.spaceId === space.id),
        closures: closures.filter((c) => c.spaceId === space.id),
      });
      const next = nextFreeWindow(week);
      return { space, idx, next, coworking: isCoworkingSpace(space) };
    })
    .filter((c) => c.next)
    .slice(0, limit);

  if (!cards.length) return null;

  return (
    <section className="home-section free-now">
      <div className="home-section-head">
        <div>
          <h2 className="home-section-title">Сейчас свободно</h2>
          <p className="home-section-sub">Ближайшие окна на площадках ЦРМ</p>
        </div>
        <Link href="/spaces" className="home-section-link">
          Все пространства
        </Link>
      </div>
      <div className="free-now-grid">
        {cards.map(({ space, idx, next, coworking }) => (
          <article key={space.id} className="free-now-card">
            <div className="free-now-avatar">
              <EntityCoverImage
                src={spaceCover(space, idx)}
                alt={space.title}
                fallback={spaceCover(space, idx + 2)}
                className="free-now-img"
                sizes="120px"
              />
            </div>
            <div className="free-now-body">
              <span className="free-now-badge">{space.category || 'Площадка'}</span>
              <h3>{space.title}</h3>
              <p>{space.address || 'Сочи'}</p>
              <strong className="free-now-slot">{next?.label}</strong>
              <div className="free-now-actions">
                <Link href={`/spaces/${encodeRouteParam(space.id)}`} className="btn btn-secondary">
                  Сетка
                </Link>
                {coworking ? (
                  <GuestAuthPrompt
                    href={`/coworking?space=${encodeURIComponent(space.id)}`}
                    className="btn btn-primary"
                    asButton
                  >
                    В коворкинг
                  </GuestAuthPrompt>
                ) : (
                  <GuestAuthPrompt
                    href={`/spaces/${encodeRouteParam(space.id)}/book`}
                    className="btn btn-primary"
                    asButton
                  >
                    Забронировать
                  </GuestAuthPrompt>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
