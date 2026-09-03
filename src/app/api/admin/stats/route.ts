import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { aclJsonError, requirePermission } from '@/lib/acl';
import {
  parseStatsRange,
  rangeStartDate,
  rangeEndDate,
  statsRangeLabel,
  periodUsesMonths,
  type StatsRange,
} from '@/lib/stats-period';

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dayKeyRu(d: Date) {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function dayKeyIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildBuckets(range: StatsRange, now = new Date()) {
  const months = periodUsesMonths(range.period, range);

  if (range.period === 'custom' && range.from && range.to) {
    const start = new Date(range.from);
    const end = new Date(range.to);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    if (months) {
      const buckets = [];
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        buckets.push({
          key: monthKey(cur),
          label: cur.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
          start: new Date(cur),
        });
        cur.setMonth(cur.getMonth() + 1);
      }
      return buckets;
    }
    const buckets = [];
    const cur = new Date(start);
    while (cur <= end) {
      buckets.push({
        key: dayKeyRu(cur),
        label: dayKeyRu(cur),
        iso: dayKeyIso(cur),
        start: new Date(cur),
      });
      cur.setDate(cur.getDate() + 1);
    }
    return buckets;
  }

  if (range.period === 'day') {
    return [{ key: dayKeyRu(now), label: dayKeyRu(now), start: rangeStartDate(range, now)! }];
  }
  if (months) {
    const count = range.period === 'all' ? 12 : 12;
    return Array.from({ length: count }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
      return {
        key: monthKey(d),
        label: d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
        start: d,
      };
    });
  }
  const days = range.period === 'week' ? 7 : 30;
  return Array.from({ length: days }).map((_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    d.setHours(0, 0, 0, 0);
    return { key: dayKeyRu(d), label: dayKeyRu(d), start: d };
  });
}

function checkInDateFilter(range: StatsRange) {
  const since = rangeStartDate(range);
  const until = rangeEndDate(range);
  if (!since && !until) return undefined;
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (since) createdAt.gte = since;
  if (until) createdAt.lte = until;
  return { createdAt };
}

function bookingDateFilter(range: StatsRange) {
  const since = rangeStartDate(range);
  const until = rangeEndDate(range);
  if (!since && !until) return undefined;
  const startTime: { gte?: Date; lte?: Date } = {};
  if (since) startTime.gte = since;
  if (until) startTime.lte = until;
  return { startTime };
}

export async function GET(req: Request) {
  try {
    await requirePermission(['stats', 'bookings']);
    const url = new URL(req.url);
    const range = parseStatsRange(url.searchParams);
    const checkInWhere = checkInDateFilter(range);
    const bookingWhere = bookingDateFilter(range);

    const bookings = await prisma.booking.findMany({
      where: {
        status: 'APPROVED',
        ...bookingWhere,
      },
      orderBy: { startTime: 'desc' },
      take: 100,
      include: {
        space: { select: { title: true } },
        _count: { select: { participants: true, checkIns: true } },
        checkIns: {
          where: checkInWhere,
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: { user: { select: { name: true, phone: true } } },
        },
      },
    });

    const [totalCheckIns, periodCheckIns, uniqueInPeriod, newUsers, appsGroup, pendingApps, pendingBookings] =
      await Promise.all([
        prisma.ticketCheckIn.count(),
        prisma.ticketCheckIn.count({ where: checkInWhere }),
        prisma.ticketCheckIn.groupBy({
          by: ['userId'],
          where: checkInWhere,
          _count: true,
        }),
        prisma.user.findMany({
          where: {
            role: { not: 'TECH' },
            ...(checkInWhere ? { createdAt: checkInWhere.createdAt } : {}),
          },
          select: { createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 5000,
        }),
        prisma.application.groupBy({
          by: ['status'],
          where: checkInWhere ? { createdAt: checkInWhere.createdAt } : undefined,
          _count: true,
        }),
        prisma.application.count({ where: { status: 'PENDING' } }),
        prisma.booking.count({ where: { status: 'PENDING', endTime: { gte: new Date() } } }),
      ]);

    const checkIns = await prisma.ticketCheckIn.findMany({
      where: checkInWhere || { createdAt: { gte: rangeStartDate({ period: 'year' })! } },
      select: { createdAt: true, method: true },
      take: 50000,
    });

    const qrCount = checkIns.filter((c) => c.method === 'QR').length;
    const manualCount = checkIns.filter((c) => c.method !== 'QR').length;

    const buckets = buildBuckets(range);
    const monthsMode = periodUsesMonths(range.period, range);

    const userStats = buckets.map((b) => {
      const count = newUsers.filter((u) => {
        if (monthsMode) return monthKey(u.createdAt) === b.key;
        return dayKeyRu(u.createdAt) === b.key;
      }).length;
      return { date: b.label, count };
    });

    const byDay = buckets.map((b) => {
      const cnt = checkIns.filter((c) => {
        if (monthsMode) return monthKey(c.createdAt) === b.key;
        if (range.period === 'custom' && 'iso' in b && b.iso) {
          return dayKeyIso(c.createdAt) === b.iso;
        }
        return dayKeyRu(c.createdAt) === b.key;
      }).length;
      return { day: b.label, cnt };
    });

    const appStats = appsGroup.map((group) => {
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

    const [vacancyApps, contestSubs, dmCount, openVacancies, openContests] = await Promise.all([
      prisma.vacancyApplication.count({ where: { createdAt: { gte: rangeStartDate(range) || undefined } } }).catch(() => 0),
      prisma.contestSubmission.count({ where: { createdAt: { gte: rangeStartDate(range) || undefined } } }).catch(() => 0),
      prisma.directMessage.count({ where: { createdAt: { gte: rangeStartDate(range) || undefined } } }).catch(() => 0),
      prisma.vacancy.count({ where: { status: 'OPEN' } }).catch(() => 0),
      prisma.contest.count({ where: { status: { in: ['OPEN', 'VOTING'] } } }).catch(() => 0),
    ]);

    return NextResponse.json({
      period: range.period,
      from: range.from,
      to: range.to,
      periodLabel: statsRangeLabel(range),
      summary: {
        totalCheckIns,
        inPeriod: periodCheckIns,
        uniqueGuests: uniqueInPeriod.length,
        newUsers: newUsers.length,
        pendingApps,
        pendingBookings,
        qrScans: qrCount,
        manualScans: manualCount,
        vacancyApplications: vacancyApps,
        contestSubmissions: contestSubs,
        messagesInPeriod: dmCount,
        openVacancies,
        openContests,
      },
      userStats,
      appStats,
      byDay,
      events: bookings.map((b) => ({
        id: b.id,
        title: b.title,
        startTime: b.startTime,
        endTime: b.endTime,
        space: b.space?.title,
        registered: b._count.participants + 1,
        checkedIn: b._count.checkIns,
        recent: b.checkIns,
      })),
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e) return aclJsonError(e);
    console.error('admin stats error', e);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}
