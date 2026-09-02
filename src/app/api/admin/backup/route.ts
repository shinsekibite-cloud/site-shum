import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { requireAdmin, aclJsonError, AclError } from '@/lib/acl';
import { prisma } from '@/lib/prisma';
import { createEncryptedProjectBackup } from '@/lib/project-backup';

function asJsonError(e: unknown, fallback: string) {
  if (e instanceof AclError) return aclJsonError(e);
  const msg =
    e instanceof Error && e.message
      ? e.message.slice(0, 280)
      : fallback;
  console.error(fallback, e);
  return NextResponse.json({ message: msg || fallback }, { status: 500 });
}

export async function GET() {
  try {
    await requireAdmin();
    const rows = await prisma.projectBackup.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        label: true,
        note: true,
        archiveSha256: true,
        contentHash: true,
        signature: true,
        keyFingerprint: true,
        byteSize: true,
        schemaVersion: true,
        createdAt: true,
        issuedById: true,
      },
    });
    return NextResponse.json({ items: rows });
  } catch (e) {
    return asJsonError(e, 'Не удалось загрузить список бэкапов');
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Нужна авторизация' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const label = typeof body?.label === 'string' ? body.label.trim() : '';
    const note = typeof body?.note === 'string' ? body.note.trim() : '';

    const result = await createEncryptedProjectBackup({
      issuedById: session.user.id,
      label: label || `Бэкап ${new Date().toLocaleString('ru-RU')}`,
      note: note || undefined,
    });

    return NextResponse.json({
      ok: true,
      backupId: result.backupId,
      filename: result.filename,
      /** Show once — AES-256 key to decrypt .ypenc */
      keyHex: result.keyHex,
      keyFingerprint: result.keyFingerprint,
      archiveSha256: result.archiveSha256,
      contentHash: result.contentHash,
      signature: result.signature,
      byteSize: result.byteSize,
      issuedAt: result.issuedAt,
      downloadPath: `/api/admin/backup/${result.backupId}/download`,
      hint:
        'Ключ шифрования показывается один раз. Файл подписан HMAC портала (signature) и защищён AES-256-GCM (магический заголовок YPBK1).',
    });
  } catch (e) {
    return asJsonError(e, 'Ошибка создания бэкапа');
  }
}
