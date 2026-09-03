import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, aclJsonError } from '@/lib/acl';

export const dynamic = 'force-dynamic';

/**
 * User picker for awards / portfolios UIs.
 * Not a general admin user directory — those stay ADMIN_ONLY.
 */
export async function GET(req: Request) {
  try {
    await requirePermission(['portfolios', 'pages']);
  } catch (e) {
    return aclJsonError(e);
  }
  const q = new URL(req.url).searchParams.get('q')?.trim() || '';
  if (q.length < 2) return NextResponse.json({ users: [] });

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { nickname: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, email: true },
    take: 10,
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({ users });
}
