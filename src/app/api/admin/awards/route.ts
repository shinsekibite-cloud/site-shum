import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { issueOfficialDocument } from '@/lib/issue-official-document';
import { OFFICIAL_DOC_TYPE_META, type OfficialDocType } from '@/lib/official-documents';
import { requirePermission, aclJsonError } from '@/lib/acl';
import { assertSameOrigin } from '@/lib/csrf-origin';

export const dynamic = 'force-dynamic';

/** Matches /admin/awards UI gate: portfolios or pages. */
const AWARDS_PERMS = ['portfolios', 'pages'] as const;

export async function GET(req: Request) {
  try {
    await requirePermission([...AWARDS_PERMS]);
  } catch (e) {
    return aclJsonError(e);
  }
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || undefined;
  const rows = await prisma.officialDocument.findMany({
    where: {
      ...(userId ? { userId } : {}),
      status: { not: 'REVOKED' },
    },
    orderBy: { issuedAt: 'desc' },
    take: 100,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json({
    items: rows,
    types: Object.entries(OFFICIAL_DOC_TYPE_META).map(([value, meta]) => ({
      value,
      label: meta.label,
    })),
  });
}

export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  let session;
  try {
    session = await requirePermission([...AWARDS_PERMS]);
  } catch (e) {
    return aclJsonError(e);
  }
  const body = await req.json().catch(() => null);
  if (!body?.userId || !body?.type || !body?.title) {
    return NextResponse.json({ error: 'userId, type, title обязательны' }, { status: 400 });
  }
  const type = String(body.type) as OfficialDocType;
  if (!OFFICIAL_DOC_TYPE_META[type]) {
    return NextResponse.json({ error: 'Неизвестный тип' }, { status: 400 });
  }
  try {
    const doc = await issueOfficialDocument({
      userId: String(body.userId),
      type,
      title: String(body.title),
      subtitle: body.subtitle ? String(body.subtitle) : null,
      body: body.body ? String(body.body) : null,
      recipientName: body.recipientName ? String(body.recipientName) : null,
      issuerName: body.issuerName ? String(body.issuerName) : null,
      template: body.template ? String(body.template) : 'classic',
      achievementCode: body.achievementCode ? String(body.achievementCode) : null,
      issuedById: session.user.id || null,
      linkToPortfolio: body.linkToPortfolio !== false,
      issuedAt: body.issuedAt ? new Date(body.issuedAt) : undefined,
    });
    return NextResponse.json({ ok: true, document: doc });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка выдачи';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
