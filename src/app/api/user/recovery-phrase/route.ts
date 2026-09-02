import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assertTrustedDevice } from '@/lib/trusted-device';
import {
  generateRecoveryPhrase,
  hashRecoveryPhrase,
  RECOVERY_PHRASE_WORDS,
} from '@/lib/recovery-phrase';
import { assertSameOrigin } from '@/lib/csrf-origin';
import { logPiiAccess } from '@/lib/pii-audit';

/** Status: whether a recovery phrase is configured. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { recoveryPhraseHash: true, recoveryPhraseCreatedAt: true },
  });

  return NextResponse.json({
    configured: Boolean(user?.recoveryPhraseHash),
    createdAt: user?.recoveryPhraseCreatedAt?.toISOString() || null,
    wordCount: RECOVERY_PHRASE_WORDS,
  });
}

const createSchema = z.object({
  password: z.string().min(1, 'Введите текущий пароль'),
  fingerprint: z.string().max(128).optional().nullable(),
});

/**
 * Generate (or rotate) a 24-word Russian recovery phrase.
 * Returns plaintext words ONCE — only the hash is stored.
 */
export async function POST(req: Request) {
  const originBlock = assertSameOrigin(req);
  if (originBlock) return originBlock;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || 'Некорректные данные' },
      { status: 400 }
    );
  }

  const trust = await assertTrustedDevice(session.user.id, parsed.data.fingerprint || null);
  if (!trust.ok) {
    return NextResponse.json({ message: trust.message, trust: trust.status }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true, deletedAt: true, blockedAt: true },
  });
  if (!user?.password || user.deletedAt || user.blockedAt) {
    return NextResponse.json({ message: 'Аккаунт недоступен' }, { status: 403 });
  }

  const passwordOk = await bcrypt.compare(parsed.data.password, user.password);
  if (!passwordOk) {
    return NextResponse.json({ message: 'Неверный текущий пароль' }, { status: 400 });
  }

  const words = generateRecoveryPhrase();
  const recoveryPhraseHash = await hashRecoveryPhrase(words);

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      recoveryPhraseHash,
      recoveryPhraseCreatedAt: new Date(),
    },
  });

  void logPiiAccess({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    targetUserId: session.user.id,
    fields: ['recoveryPhrase'],
    reason: 'recovery_phrase_rotate',
  });

  return NextResponse.json({
    words,
    wordCount: words.length,
    message:
      'Сохраните эти 24 слова в надёжном месте. Они показываются только сейчас — восстановить текст фразы с сервера нельзя.',
  });
}
