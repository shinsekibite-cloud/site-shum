import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {
  ACCOUNT_ARCHIVE_YEARS,
  ACCOUNT_DELETION_GRACE_DAYS,
  cancelAccountDeletion,
  requestAccountDeletion,
} from '@/lib/account-deletion';
import { assertTrustedDevice } from '@/lib/trusted-device';
import { createUserNotification } from '@/lib/security';
import { prisma } from '@/lib/prisma';
import { assertSameOrigin } from '@/lib/csrf-origin';
import { logPiiAccess } from '@/lib/pii-audit';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      deletionRequestedAt: true,
      deletionEffectiveAt: true,
      deletedAt: true,
    },
  });
  return NextResponse.json({
    graceDays: ACCOUNT_DELETION_GRACE_DAYS,
    archiveYears: ACCOUNT_ARCHIVE_YEARS,
    ...user,
  });
}

export async function POST(req: Request) {
  const originBlock = assertSameOrigin(req);
  if (originBlock) return originBlock;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action === 'cancel' ? 'cancel' : 'request';
  const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint.slice(0, 128) : null;

  const trust = await assertTrustedDevice(session.user.id, fingerprint);
  if (!trust.ok) {
    return NextResponse.json({ message: trust.message, trust: trust.status }, { status: 403 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { deletionRequestedAt: true, deletedAt: true, role: true },
  });
  if (!me || me.deletedAt) {
    return NextResponse.json({ message: 'Аккаунт уже удалён' }, { status: 400 });
  }
  if (me.role === 'ADMIN') {
    return NextResponse.json(
      { message: 'Администратор не может удалить аккаунт этим способом. Обратитесь к другому админу.' },
      { status: 400 }
    );
  }

  if (action === 'cancel') {
    if (!me.deletionRequestedAt) {
      return NextResponse.json({ message: 'Удаление не запрошено' }, { status: 400 });
    }
    await cancelAccountDeletion(session.user.id);
    await createUserNotification({
      userId: session.user.id,
      type: 'SECURITY',
      title: 'Удаление отменено',
      body: 'Заявка на удаление аккаунта отменена. Профиль снова активен без ограничений срока.',
    });
    return NextResponse.json({ ok: true, cancelled: true });
  }

  if (me.deletionRequestedAt) {
    return NextResponse.json({ message: 'Удаление уже запрошено' }, { status: 400 });
  }

  const confirm = typeof body.confirm === 'string' ? body.confirm.trim().toUpperCase() : '';
  if (confirm !== 'УДАЛИТЬ') {
    return NextResponse.json(
      { message: 'Для подтверждения введите слово УДАЛИТЬ' },
      { status: 400 }
    );
  }

  const result = await requestAccountDeletion(session.user.id);
  void logPiiAccess({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    targetUserId: session.user.id,
    fields: ['account'],
    reason: 'account_deletion_request',
  });
  await createUserNotification({
    userId: session.user.id,
    type: 'SECURITY',
    title: 'Запрошено удаление аккаунта',
    body: `У вас есть ${ACCOUNT_DELETION_GRACE_DAYS} дней, чтобы отменить удаление в настройках профиля. После этого аккаунт будет деактивирован, а архив данных сохранится на портале ${ACCOUNT_ARCHIVE_YEARS} лет.`,
  });

  return NextResponse.json({
    ok: true,
    deletionRequestedAt: result.deletionRequestedAt,
    deletionEffectiveAt: result.deletionEffectiveAt,
    graceDays: ACCOUNT_DELETION_GRACE_DAYS,
    archiveYears: ACCOUNT_ARCHIVE_YEARS,
  });
}
