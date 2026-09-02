import { NextRequest, NextResponse } from 'next/server';
import { buildEventIcs } from '@/lib/ics';

/** ASCII-safe Content-Disposition filename (Cyrillic in headers → 500 / ERR_INVALID_RESPONSE). */
function icsFileName(title: string) {
  const ascii = title
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${ascii || 'event'}.ics`;
}

/**
 * Public ICS download so mobile OS can open the file in Yandex/Google/Apple Calendar.
 * GET /api/calendar/ics?uid=&title=&start=&end=&description=&location=
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const uid = (sp.get('uid') || 'event').slice(0, 120);
  const title = (sp.get('title') || 'Событие').slice(0, 200);
  const startRaw = sp.get('start');
  const endRaw = sp.get('end');
  if (!startRaw || !endRaw) {
    return NextResponse.json({ message: 'start and end required' }, { status: 400 });
  }
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ message: 'invalid dates' }, { status: 400 });
  }

  const ics = buildEventIcs({
    uid,
    title,
    description: sp.get('description'),
    location: sp.get('location'),
    start,
    end,
    url: sp.get('url'),
  });

  const fileName = icsFileName(title);
  // RFC 5987 for UTF-8 display name in supporting clients
  const fileNameStar = `UTF-8''${encodeURIComponent(`${title.slice(0, 60).trim() || 'event'}.ics`)}`;
  // inline → OS / browser can hand off to Yandex/Apple Calendar instead of forcing download
  const inline = sp.get('inline') === '1' || sp.get('inline') === 'true';
  const disposition = inline
    ? `inline; filename="${fileName}"; filename*=${fileNameStar}`
    : `attachment; filename="${fileName}"; filename*=${fileNameStar}`;

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  });
}
