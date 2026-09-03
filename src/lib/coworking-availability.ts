import { prisma } from '@/lib/prisma';
import {
  COWORKING_PERIODS,
  isCoworkingSpace,
  occupiedSeatStatuses,
  periodBounds,
  todayKey,
} from '@/lib/coworking';

export type CoworkingPeriodAvailability = {
  id: string;
  label: string;
  start: string;
  end: string;
  used: number;
  wait: number;
  left: number;
};

export type CoworkingSpaceAvailability = {
  id: string;
  title: string;
  address: string | null;
  capacity: number;
  image: string | null;
  category: string | null;
  periods: CoworkingPeriodAvailability[];
};

/** Shared SSR/API payload for coworking venue + period availability. */
export async function getCoworkingAvailability(dayKey = todayKey()): Promise<{
  dayKey: string;
  spaces: CoworkingSpaceAvailability[];
}> {
  const spaces = await prisma.space.findMany({
    where: {
      status: 'ACTIVE',
      isDemoData: false,
    },
    orderBy: { title: 'asc' },
  });
  const coworking = spaces.filter((s) => isCoworkingSpace(s));

  const signups = await prisma.coworkingSignup.findMany({
    where: {
      spaceId: { in: coworking.map((s) => s.id) },
      dayKey,
      status: { in: [...occupiedSeatStatuses(), 'WAITLIST'] },
    },
    select: { spaceId: true, period: true, seats: true, status: true, startTime: true, endTime: true },
  });

  const occupied = new Set<string>(occupiedSeatStatuses());
  const availability = coworking.map((space) => {
    const periods = COWORKING_PERIODS.map((p) => {
      const { start, end } = periodBounds(dayKey, p.id);
      const used = signups
        .filter(
          (s) =>
            s.spaceId === space.id &&
            occupied.has(s.status) &&
            s.startTime < end &&
            s.endTime > start
        )
        .reduce((acc, s) => acc + s.seats, 0);
      const wait = signups
        .filter(
          (s) =>
            s.spaceId === space.id &&
            s.status === 'WAITLIST' &&
            s.startTime < end &&
            s.endTime > start
        )
        .reduce((acc, s) => acc + s.seats, 0);
      const left = Math.max(0, space.capacity - used);
      return { ...p, used, wait, left };
    });
    return {
      id: space.id,
      title: space.title,
      address: space.address,
      capacity: space.capacity,
      image: space.image,
      category: space.category,
      periods,
    };
  });

  return { dayKey, spaces: availability };
}
