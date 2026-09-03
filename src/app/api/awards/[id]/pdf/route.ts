import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readFile } from 'fs/promises';
import { resolveUnderUploads } from '@/lib/safe-path';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  const { id } = await ctx.params;
  const doc = await prisma.officialDocument.findUnique({ where: { id } });
  if (!doc || doc.status === 'REVOKED' || !doc.pdfPath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const role = session?.user?.role;
  const isOwner = session?.user?.id === doc.userId;
  const isStaff = role === 'ADMIN' || role === 'MODERATOR' || role === 'TECH';
  if (!isOwner && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const abs = resolveUnderUploads(doc.pdfPath);
    if (!abs) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    const buf = await readFile(abs);
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${doc.serialNumber}.pdf"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch {
    return NextResponse.json({ error: 'PDF missing' }, { status: 404 });
  }
}
