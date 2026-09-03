import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assertSameOrigin } from '@/lib/csrf-origin';
import { parseTagList, serializeTagList } from '@/lib/profile-meta';
import { aclJsonError, requirePermission } from '@/lib/acl';

export async function GET(req: Request) {
  try {
    await requirePermission('moderation');
  } catch (e) {
    return aclJsonError(e);
  }

  const status = new URL(req.url).searchParams.get('status') || 'PENDING';
  const rows = await prisma.profileTagSuggestion.findMany({
    where: status === 'ALL' ? undefined : { status },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { id: true, name: true, publicCode: true, email: true } },
    },
  });

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      tag: r.tag,
      status: r.status,
      createdAt: r.createdAt,
      reviewNote: r.reviewNote,
      user: {
        id: r.user.id,
        name: r.user.name,
        publicCode: r.user.publicCode,
        email: r.user.email,
      },
    })),
  });
}

export async function POST(req: Request) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

  let session;
  try {
    session = await requirePermission('moderation');
  } catch (e) {
    return aclJsonError(e);
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '');
  const action = String(body.action || '');
  const note = String(body.note || '').trim().slice(0, 200) || null;
  if (!id || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ message: 'Некорректный запрос' }, { status: 400 });
  }

  const row = await prisma.profileTagSuggestion.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ message: 'Не найдено' }, { status: 404 });
  if (row.status !== 'PENDING') {
    return NextResponse.json({ message: 'Уже обработано' }, { status: 409 });
  }

  if (action === 'reject') {
    await prisma.profileTagSuggestion.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedById: session.user.id,
        reviewNote: note,
      },
    });
    return NextResponse.json({ message: 'Отклонено' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.profileTagSuggestion.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedById: session.user.id,
        reviewNote: note,
      },
    });

    const user = await tx.user.findUnique({
      where: { id: row.userId },
      select: { hobbies: true, interests: true },
    });
    if (!user) return;
    const field = row.kind === 'interests' ? 'interests' : 'hobbies';
    const current = parseTagList(field === 'interests' ? user.interests : user.hobbies);
    if (!current.some((t) => t.toLowerCase() === row.tag.toLowerCase())) {
      const next = serializeTagList([...current, row.tag].slice(0, 30));
      await tx.user.update({
        where: { id: row.userId },
        data: { [field]: next },
      });
    }
  });

  return NextResponse.json({ message: 'Одобрено и добавлено в профиль' });
}
