import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assertCleanText, ProfanityError } from '@/lib/censor';
import { createUserNotification } from '@/lib/security';
import { hashPortfolioContent, toPortfolioPayload } from '@/lib/portfolio';
import { hasPermission } from '@/lib/acl-shared';
import {
  buildPortfolioDiff,
  nextPortfolioSubmitAt,
  parsePortfolioSnapshot,
  snapshotFromPayload,
} from '@/lib/portfolio-diff';

const sectionSchema = z.object({
  id: z.string().optional(),
  type: z.string().max(40).default('CUSTOM'),
  title: z.string().min(1).max(120),
  body: z.string().max(8000).default(''),
  mediaUrl: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isVisible: z.boolean().optional(),
});

const certSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(160),
  issuer: z.string().max(160).nullable().optional(),
  issuedAt: z.string().max(40).nullable().optional(),
  fileUrl: z.string().max(500).nullable().optional(),
  fileName: z.string().max(200).nullable().optional(),
  mimeType: z.string().max(120).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isVisible: z.boolean().optional(),
});

const saveSchema = z.object({
  headline: z.string().max(160).nullable().optional(),
  summary: z.string().max(4000).nullable().optional(),
  coverImage: z.string().max(500).nullable().optional(),
  theme: z.enum(['MODERN', 'CLASSIC', 'MINIMAL']).optional(),
  sections: z.array(sectionSchema).max(20).optional(),
  certificates: z.array(certSchema).max(30).optional(),
  achievementCodes: z.array(z.string().max(64)).max(40).optional(),
  submit: z.boolean().optional(),
});

const include = {
  sections: { orderBy: { sortOrder: 'asc' as const } },
  certificates: { orderBy: { sortOrder: 'asc' as const } },
  achievementLinks: { orderBy: { sortOrder: 'asc' as const } },
  user: {
    select: {
      id: true,
      name: true,
      nickname: true,
      city: true,
      image: true,
      publicCode: true,
    },
  },
};

async function getCooldownDays() {
  const settings = await prisma.siteSettings.findUnique({
    where: { id: '1' },
    select: { portfolioSubmitCooldownDays: true },
  });
  const days = settings?.portfolioSubmitCooldownDays;
  return Number.isFinite(days as number) ? Math.max(0, Math.floor(days as number)) : 7;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let portfolio = await prisma.userPortfolio.findUnique({
    where: { userId: session.user.id },
    include,
  });

  if (!portfolio) {
    portfolio = await prisma.userPortfolio.create({
      data: {
        userId: session.user.id,
        headline: null,
        summary: null,
        status: 'DRAFT',
      },
      include,
    });
  }

  const unlocked = await prisma.userAchievement.findMany({
    where: { userId: session.user.id },
    select: { code: true },
  });

  const cooldownDays = await getCooldownDays();
  const nextSubmitAt = nextPortfolioSubmitAt(portfolio.submittedAt, cooldownDays);
  const canSubmitNow =
    portfolio.status !== 'PENDING' && (!nextSubmitAt || nextSubmitAt.getTime() <= Date.now());

  return NextResponse.json({
    portfolio,
    unlockedAchievementCodes: unlocked.map((u) => u.code),
    cooldownDays,
    nextSubmitAt: nextSubmitAt?.toISOString() || null,
    canSubmitNow,
  });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = saveSchema.parse(body);
    assertCleanText(data.headline || '', data.summary || '');
    for (const s of data.sections || []) assertCleanText(s.title, s.body);
    for (const c of data.certificates || []) assertCleanText(c.title, c.issuer || '');

    const existing = await prisma.userPortfolio.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        approvedSnapshot: true,
      },
    });

    const submit = Boolean(data.submit);
    const cooldownDays = await getCooldownDays();

    if (submit) {
      if (existing?.status === 'PENDING') {
        return NextResponse.json(
          { message: 'Портфолио уже на проверке' },
          { status: 400 }
        );
      }
      const nextAt = nextPortfolioSubmitAt(existing?.submittedAt, cooldownDays);
      if (nextAt && nextAt.getTime() > Date.now()) {
        return NextResponse.json(
          {
            message: `Повторная отправка на проверку доступна с ${nextAt.toLocaleString('ru-RU')}`,
            nextSubmitAt: nextAt.toISOString(),
            cooldownDays,
          },
          { status: 429 }
        );
      }
    }

    const portfolioId =
      existing?.id ||
      (
        await prisma.userPortfolio.create({
          data: { userId: session.user.id, status: 'DRAFT' },
          select: { id: true },
        })
      ).id;

    if (data.sections) {
      await prisma.portfolioSection.deleteMany({ where: { portfolioId } });
      if (data.sections.length) {
        await prisma.portfolioSection.createMany({
          data: data.sections.map((s, i) => ({
            portfolioId,
            type: s.type || 'CUSTOM',
            title: s.title.trim(),
            body: s.body || '',
            mediaUrl: s.mediaUrl || null,
            sortOrder: s.sortOrder ?? i,
            isVisible: s.isVisible !== false,
          })),
        });
      }
    }

    if (data.certificates) {
      await prisma.portfolioCertificate.deleteMany({ where: { portfolioId } });
      if (data.certificates.length) {
        await prisma.portfolioCertificate.createMany({
          data: data.certificates.map((c, i) => ({
            portfolioId,
            title: c.title.trim(),
            issuer: c.issuer || null,
            issuedAt: c.issuedAt ? new Date(c.issuedAt) : null,
            fileUrl: c.fileUrl || null,
            fileName: c.fileName || null,
            mimeType: c.mimeType || null,
            sortOrder: c.sortOrder ?? i,
            isVisible: c.isVisible !== false,
          })),
        });
      }
    }

    if (data.achievementCodes) {
      const unlocked = await prisma.userAchievement.findMany({
        where: { userId: session.user.id, code: { in: data.achievementCodes } },
        select: { code: true },
      });
      const allowed = new Set(unlocked.map((u) => u.code));
      const codes = data.achievementCodes.filter((c) => allowed.has(c));
      await prisma.portfolioAchievementLink.deleteMany({ where: { portfolioId } });
      if (codes.length) {
        await prisma.portfolioAchievementLink.createMany({
          data: codes.map((code, i) => ({ portfolioId, code, sortOrder: i })),
        });
      }
    }

    const portfolio = await prisma.userPortfolio.update({
      where: { id: portfolioId },
      data: {
        headline: data.headline !== undefined ? data.headline : undefined,
        summary: data.summary !== undefined ? data.summary : undefined,
        coverImage: data.coverImage !== undefined ? data.coverImage : undefined,
        theme: data.theme || undefined,
        ...(submit
          ? {
              status: 'PENDING' as const,
              submittedAt: new Date(),
              rejectReason: null,
              reviewedAt: null,
              reviewedById: null,
            }
          : existing?.status === 'APPROVED'
            ? { status: 'DRAFT' as const, publishedAt: null }
            : {}),
      },
      include,
    });

    const payload = toPortfolioPayload(portfolio);
    const contentHash = hashPortfolioContent(payload);
    let pendingDiffJson: string | null | undefined = undefined;

    if (submit) {
      const previous = parsePortfolioSnapshot(existing?.approvedSnapshot);
      const snap = snapshotFromPayload(payload);
      const diff = buildPortfolioDiff(previous, snap);
      pendingDiffJson = JSON.stringify(diff);
    }

    const updated = await prisma.userPortfolio.update({
      where: { id: portfolio.id },
      data: {
        contentHash,
        ...(pendingDiffJson !== undefined ? { pendingDiffJson } : {}),
      },
      include,
    });

    if (submit) {
      const staff = await prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'MODERATOR'] },
          deletedAt: null,
          blockedAt: null,
        },
        select: { id: true, role: true, permissions: true },
        take: 80,
      });
      const recipients = staff.filter(
        (u) => u.role === 'ADMIN' || hasPermission(u.role, u.permissions, 'portfolios')
      );
      const name = session.user.name || 'Пользователь';
      await Promise.all(
        recipients.map((u) =>
          createUserNotification({
            userId: u.id,
            type: 'PORTFOLIO',
            title: 'Портфолио на проверке',
            body: `${name} отправил(а) портфолио на одобрение`,
            meta: { href: '/admin/portfolios', portfolioId: portfolio.id },
          })
        )
      );
    }

    const nextSubmitAt = nextPortfolioSubmitAt(updated.submittedAt, cooldownDays);
    const canSubmitNow =
      updated.status !== 'PENDING' && (!nextSubmitAt || nextSubmitAt.getTime() <= Date.now());

    return NextResponse.json({
      portfolio: updated,
      cooldownDays,
      nextSubmitAt: nextSubmitAt?.toISOString() || null,
      canSubmitNow,
    });
  } catch (error) {
    if (error instanceof ProfanityError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Некорректные данные', issues: error.issues }, { status: 400 });
    }
    console.error('PUT /api/user/portfolio', error);
    return NextResponse.json({ message: 'Не удалось сохранить портфолио' }, { status: 500 });
  }
}
