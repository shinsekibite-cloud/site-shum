import { NextResponse } from 'next/server';
import { fairyTaleAvatarSvg } from '@/lib/privacy-alias';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clean = (id || '').trim();
  if (!clean || clean.length > 80 || /[^\w-]/.test(clean)) {
    return NextResponse.json({ message: 'Некорректный id' }, { status: 400 });
  }

  const svg = fairyTaleAvatarSvg(clean, 128);
  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
