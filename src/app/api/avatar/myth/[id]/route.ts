import { NextResponse } from 'next/server';
import { mythicalAvatarSvg } from '@/lib/mythical-characters';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clean = decodeURIComponent(id || '').trim().slice(0, 64);
  if (!clean) {
    return NextResponse.json({ message: 'Некорректный id' }, { status: 400 });
  }

  const svg = mythicalAvatarSvg(clean, 256);
  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
