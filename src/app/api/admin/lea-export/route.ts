import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { createLeaEncryptedExport } from '@/lib/lea-export';
import { prisma } from '@/lib/prisma';
import { createUserNotification } from '@/lib/security';

function unauthorized() {
  return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });
}

/** ADMIN only: create one-time encrypted LEA archive for a user. */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') return unauthorized();

    const body = await req.json().catch(() => ({}));
    const userId = typeof body.userId === 'string' ? body.userId : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const legalBasis = typeof body.legalBasis === 'string' ? body.legalBasis.trim() : '';
    if (!userId || reason.length < 8) {
      return NextResponse.json(
        { message: 'Укажите пользователя и основание выдачи (мин. 8 символов)' },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!target) return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });

    const result = await createLeaEncryptedExport({
      targetUserId: userId,
      issuedById: session.user.id,
      reason,
      legalBasis: legalBasis || undefined,
    });
    if (!result) {
      return NextResponse.json({ message: 'Не удалось сформировать архив' }, { status: 500 });
    }

    // Audit notification for other admins (no key in body)
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', blockedAt: null, deletedAt: null, id: { not: session.user.id } },
      select: { id: true },
      take: 20,
    });
    await Promise.all(
      admins.map((a) =>
        createUserNotification({
          userId: a.id,
          type: 'SECURITY',
          title: 'Выдача данных по запросу органа',
          body: `${session.user.name || 'Админ'} сформировал шифрованный архив ПДн пользователя ${target.name || target.email}. Основание: ${reason.slice(0, 160)}`,
          meta: { href: `/admin/users/${userId}`, exportId: result.exportId },
        })
      )
    );

    return NextResponse.json({
      ok: true,
      exportId: result.exportId,
      filename: result.filename,
      archiveSha256: result.archiveSha256,
      keyFingerprint: result.keyFingerprint,
      byteSize: result.byteSize,
      /** Shown once — share securely with the requesting authority together with the archive */
      oneTimeKeyHex: result.keyHex,
      downloadPath: `/api/admin/lea-export/${result.exportId}/download`,
      warning:
        'Ключ показывается один раз. Передайте архив и ключ отдельно уполномоченному органу. Ключ в БД не хранится.',
    });
  } catch (e) {
    console.error('POST /api/admin/lea-export', e);
    return NextResponse.json({ message: 'Ошибка выдачи' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') return unauthorized();
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    const rows = await prisma.leaDataExport.findMany({
      where: userId ? { targetUserId: userId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        targetUserId: true,
        issuedById: true,
        reason: true,
        legalBasis: true,
        archiveSha256: true,
        keyFingerprint: true,
        byteSize: true,
        keyRevealedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ items: rows });
  } catch (e) {
    console.error('GET /api/admin/lea-export', e);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}
