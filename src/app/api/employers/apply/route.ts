import { rejectIfModuleDisabled } from '@/lib/require-module';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { consumeCaptchaToken } from '@/lib/captcha';
import { isEndUserRole } from '@/lib/acl-shared';
import { assertSameOrigin } from '@/lib/csrf-origin';

const schema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().max(40).optional(),
  websiteUrl: z.string().max(300).optional(),
  captchaToken: z.string().min(10),
  website: z.string().optional(),
});

/** Members: request to become an employer (moderated) */
export async function POST(req: Request) {
  {
    const csrf = assertSameOrigin(req);
    if (csrf) return csrf;
  }
  {
    const blocked = await rejectIfModuleDisabled('vacancies');
    if (blocked) return blocked;
  }
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !isEndUserRole(session.user.role)) {
      return NextResponse.json({ message: 'Войдите в аккаунт' }, { status: 401 });
    }
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message || 'Данные' }, { status: 400 });
    }
    const cap = await consumeCaptchaToken(parsed.data.captchaToken, parsed.data.website);
    if (!cap.ok) return NextResponse.json({ message: cap.message }, { status: 400 });

    const existing = await prisma.employer.findFirst({
      where: { submittedById: session.user.id, status: { in: ['PENDING', 'APPROVED'] } },
      select: { id: true, status: true, title: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.status === 'PENDING') {
      return NextResponse.json(
        { message: 'Заявка уже на проверке', employer: existing },
        { status: 400 }
      );
    }
    if (existing?.status === 'APPROVED') {
      return NextResponse.json(
        { message: 'Организация уже подтверждена', employer: existing },
        { status: 400 }
      );
    }

    const row = await prisma.employer.create({
      data: {
        title: parsed.data.title.trim(),
        description: parsed.data.description || null,
        contactName: parsed.data.contactName || session.user.name || null,
        contactEmail: parsed.data.contactEmail || session.user.email || null,
        contactPhone: parsed.data.contactPhone || null,
        websiteUrl: parsed.data.websiteUrl || null,
        isInternal: false,
        status: 'PENDING',
        submittedById: session.user.id,
      },
    });

    return NextResponse.json({ ok: true, employer: { id: row.id, status: row.status } });
  } catch (e) {
    console.error('employer apply', e);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}

export async function GET() {
  {
    const blocked = await rejectIfModuleDisabled('vacancies');
    if (blocked) return blocked;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Войдите' }, { status: 401 });
  }
  const employer = await prisma.employer.findFirst({
    where: { submittedById: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      _count: { select: { vacancies: true } },
    },
  });
  return NextResponse.json({ employer });
}
