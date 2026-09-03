import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_HOBBIES,
  DEFAULT_INTERESTS,
  parseTagList,
} from '@/lib/profile-meta';
import { containsUnsafeContent } from '@/lib/censor';
import { assertSameOrigin } from '@/lib/csrf-origin';
import { canProposeTagToday } from '@/lib/profile-identity';

function isCleanTag(tag: string) {
  const t = tag.trim();
  if (t.length < 2 || t.length > 40) return false;
  return !containsUnsafeContent(t);
}

function normalizeKind(raw: string | null) {
  return raw === 'interests' ? 'interests' : 'hobbies';
}

/** Aggregate popular + approved tags; return pending for current user */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const kind = normalizeKind(searchParams.get('kind'));
  const defaults = kind === 'interests' ? DEFAULT_INTERESTS : DEFAULT_HOBBIES;
  const session = await getServerSession(authOptions);

  const [users, approved, pending, canPropose] = await Promise.all([
    prisma.user.findMany({
      where: { [kind]: { not: null } },
      select: { hobbies: true, interests: true },
      take: 400,
    }),
    prisma.profileTagSuggestion.findMany({
      where: { kind, status: 'APPROVED' },
      select: { tag: true },
      take: 200,
      orderBy: { reviewedAt: 'desc' },
    }),
    session?.user?.id
      ? prisma.profileTagSuggestion.findMany({
          where: { userId: session.user.id, status: 'PENDING' },
          select: { id: true, tag: true, kind: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
    session?.user?.id ? canProposeTagToday(session.user.id) : Promise.resolve(false),
  ]);

  const counts = new Map<string, number>();
  for (const u of users) {
    const tags = parseTagList(kind === 'interests' ? u.interests : u.hobbies);
    for (const tag of tags) {
      const key = tag.trim();
      if (!isCleanTag(key)) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  for (const row of approved) {
    const key = row.tag.trim();
    if (!isCleanTag(key)) continue;
    if (!counts.has(key)) counts.set(key, 1);
  }

  const fromUsers = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([tag, count]) => ({ tag, count, source: 'users' as const }));

  const seen = new Set(fromUsers.map((x) => x.tag.toLowerCase()));
  const fromDefaults = defaults
    .filter((t) => isCleanTag(t) && !seen.has(t.toLowerCase()))
    .map((tag) => ({ tag, count: 0, source: 'default' as const }));

  return NextResponse.json({
    kind,
    suggestions: [...fromUsers, ...fromDefaults].slice(0, 60),
    pending,
    canProposeToday: canPropose,
  });
}

/** Propose a custom hobby/interest (1 per MSK day) — pending moderation */
export async function POST(req: Request) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Войдите в аккаунт' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const kind = normalizeKind(String(body.kind || ''));
  const tag = String(body.tag || '').trim().replace(/\s+/g, ' ');
  if (!isCleanTag(tag)) {
    return NextResponse.json({ message: 'Этот вариант нельзя добавить' }, { status: 400 });
  }

  const okToday = await canProposeTagToday(session.user.id);
  if (!okToday) {
    return NextResponse.json(
      { message: 'Свой вариант можно предложить только 1 раз в сутки' },
      { status: 429 }
    );
  }

  const existing = await prisma.profileTagSuggestion.findFirst({
    where: {
      userId: session.user.id,
      kind,
      tag: { equals: tag, mode: 'insensitive' },
    },
  });
  if (existing?.status === 'PENDING') {
    return NextResponse.json({ message: 'Этот вариант уже на проверке' }, { status: 409 });
  }
  if (existing?.status === 'APPROVED') {
    return NextResponse.json({ message: 'Вариант уже одобрен — выберите его из списка' }, { status: 409 });
  }
  if (existing?.status === 'REJECTED') {
    await prisma.profileTagSuggestion.delete({ where: { id: existing.id } });
  }

  const row = await prisma.profileTagSuggestion.create({
    data: {
      userId: session.user.id,
      kind,
      tag,
      status: 'PENDING',
    },
  });

  return NextResponse.json({
    message: 'Отправлено на проверку модератору',
    suggestion: {
      id: row.id,
      tag: row.tag,
      kind: row.kind,
      status: row.status,
      createdAt: row.createdAt,
    },
  });
}
