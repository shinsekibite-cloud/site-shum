import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { requireAdmin, aclJsonError, AclError } from '@/lib/acl';
import { prisma } from '@/lib/prisma';
import { resolvePrivateStoragePath } from '@/lib/private-storage';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const row = await prisma.projectBackup.findUnique({ where: { id } });
    if (!row) {
      return NextResponse.json({ message: 'Бэкап не найден' }, { status: 404 });
    }

    const abs = resolvePrivateStoragePath(row.storagePath);
    const buf = await readFile(abs);
    const filename = path.basename(row.storagePath) || `backup-${id}.ypenc`;

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buf.length),
        'X-Archive-SHA256': row.archiveSha256,
        'X-Content-Hash': row.contentHash,
        'X-Portal-Signature': row.signature,
        'X-Key-Fingerprint': row.keyFingerprint,
      },
    });
  } catch (e) {
    if (e instanceof AclError) return aclJsonError(e);
    console.error('GET /api/admin/backup/[id]/download', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Ошибка скачивания' },
      { status: 500 }
    );
  }
}
