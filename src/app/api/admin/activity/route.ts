import { NextResponse } from 'next/server';
import { requireAdmin, aclJsonError } from '@/lib/acl';
import { prisma } from '@/lib/prisma';
import {
  ACTION_LABELS_RU,
  CATEGORY_LABELS_RU,
  type UserActionCategory,
} from '@/lib/user-action-log-shared';

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const category = (url.searchParams.get('category') || '').trim();
    const action = (url.searchParams.get('action') || '').trim();
    const userId = (url.searchParams.get('userId') || '').trim();
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const take = Math.min(100, Math.max(10, parseInt(url.searchParams.get('take') || '40', 10) || 40));
    const skip = (page - 1) * take;

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (q) {
      where.OR = [
        { userEmail: { contains: q, mode: 'insensitive' } },
        { userCode: { contains: q, mode: 'insensitive' } },
        { summary: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
        { userId: { contains: q } },
        { targetId: { contains: q } },
        { ip: { contains: q } },
      ];
    }

    const [total, rows, byCategory] = await Promise.all([
      prisma.userActionLog.count({ where }),
      prisma.userActionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.userActionLog.groupBy({
        by: ['category'],
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      take,
      totalPages: Math.max(1, Math.ceil(total / take)),
      items: rows,
      labels: { actions: ACTION_LABELS_RU, categories: CATEGORY_LABELS_RU },
      stats: {
        byCategory: byCategory.map((r) => ({
          category: r.category as UserActionCategory,
          count: r._count._all,
          label: CATEGORY_LABELS_RU[r.category as UserActionCategory] || r.category,
        })),
      },
    });
  } catch (e) {
    return aclJsonError(e);
  }
}
