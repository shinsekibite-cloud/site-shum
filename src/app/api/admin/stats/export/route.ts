import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { aclJsonError, requirePermission } from '@/lib/acl';
import { parseStatsRange, rangeStartDate, rangeEndDate, statsRangeLabel } from '@/lib/stats-period';
import { formatMskDateTime } from '@/lib/booking-hours';

function csvEscape(v: string | number | null | undefined) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function checkInDateFilter(range: ReturnType<typeof parseStatsRange>) {
  const since = rangeStartDate(range);
  const until = rangeEndDate(range);
  if (!since && !until) return undefined;
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (since) createdAt.gte = since;
  if (until) createdAt.lte = until;
  return { createdAt };
}

export async function GET(req: Request) {
  try {
    await requirePermission(['stats', 'bookings']);
    const url = new URL(req.url);
    const range = parseStatsRange(url.searchParams);
    const where = checkInDateFilter(range);

    const rows = await prisma.ticketCheckIn.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: {
        user: { select: { name: true, email: true, phone: true } },
        scannedBy: { select: { name: true, email: true } },
        booking: {
          select: {
            title: true,
            startTime: true,
            space: { select: { title: true } },
          },
        },
      },
    });

    const header = [
      'Дата и время (МСК)',
      'Мероприятие',
      'Площадка',
      'Гость',
      'Телефон',
      'Email',
      'Способ',
      'Сканировал',
    ];

    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          formatMskDateTime(r.createdAt, { withYear: true }),
          r.booking.title,
          r.booking.space?.title || '',
          r.user.name || '',
          r.user.phone || '',
          r.user.email || '',
          r.method === 'QR' ? 'QR' : 'Вручную',
          r.scannedBy.name || r.scannedBy.email || '',
        ]
          .map(csvEscape)
          .join(',')
      ),
    ];

    const label = statsRangeLabel(range).replace(/[^\w\d\-–— ]/gi, '');
    const filename = `prohody-${label.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse('\uFEFF' + lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e) return aclJsonError(e);
    console.error('admin stats export error', e);
    return NextResponse.json({ message: 'Ошибка экспорта' }, { status: 500 });
  }
}
