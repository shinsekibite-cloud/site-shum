import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readFile } from 'fs/promises';
import { resolvePrivateStoragePath } from '@/lib/private-storage';

function unauthorized() {
  return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') return unauthorized();
    const { id } = await ctx.params;
    const row = await prisma.leaDataExport.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ message: 'Не найдено' }, { status: 404 });

    const abs = resolvePrivateStoragePath(row.storagePath);
    const buf = await readFile(abs);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="lea-${id.slice(0, 8)}.ypenc"`,
        'X-Archive-SHA256': row.archiveSha256,
        'X-Key-Fingerprint': row.keyFingerprint,
      },
    });
  } catch (e) {
    console.error('GET lea download', e);
    return NextResponse.json({ message: 'Файл недоступен' }, { status: 500 });
  }
}
