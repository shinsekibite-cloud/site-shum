import { rejectIfModuleDisabled } from '@/lib/require-module';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkVacancyEligibility } from '@/lib/vacancy-eligibility';
import { sanitizeCmsHtml } from '@/lib/sanitize-html';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  {
    const blocked = await rejectIfModuleDisabled('vacancies');
    if (blocked) return blocked;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Войдите в аккаунт' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const vacancy = await prisma.vacancy.findUnique({
    where: { id },
    include: {
      employer: {
        select: { id: true, title: true, isInternal: true, description: true, status: true },
      },
      questions: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          kind: true,
          prompt: true,
          optionsJson: true,
          weight: true,
          // do not expose knockout / correctJson — reduces gaming
        },
      },
      _count: {
        select: { applications: { where: { status: 'APPROVED' } } },
      },
    },
  });
  if (!vacancy || vacancy.status !== 'OPEN' || vacancy.employer.status !== 'APPROVED') {
    return NextResponse.json({ message: 'Вакансия недоступна' }, { status: 404 });
  }

  const elig = await checkVacancyEligibility(session.user.id, id);
  const eligibility = elig.ok
    ? { ok: true as const }
    : { ok: false as const, message: elig.message, code: elig.code };

  const myApp = await prisma.vacancyApplication.findUnique({
    where: { userId_vacancyId: { userId: session.user.id, vacancyId: id } },
    select: {
      id: true,
      status: true,
      autoScore: true,
      rejectReason: true,
      createdAt: true,
      coverLetter: true,
    },
  });

  const requirements: string[] = [];
  try {
    const raw = vacancy.requirementsJson ? JSON.parse(vacancy.requirementsJson) : [];
    if (Array.isArray(raw)) requirements.push(...raw.map(String).filter(Boolean));
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    vacancy: {
      id: vacancy.id,
      title: vacancy.title,
      description: sanitizeCmsHtml(vacancy.description),
      workFormat: vacancy.workFormat,
      city: vacancy.city,
      ageMin: vacancy.ageMin,
      ageMax: vacancy.ageMax,
      minReliability: vacancy.minReliability,
      minSocial: vacancy.minSocial,
      needInstructions: vacancy.needInstructions,
      closesAt: vacancy.closesAt,
      seats: vacancy.seats,
      seatsTaken: vacancy._count.applications,
      requirements,
      employer: {
        ...vacancy.employer,
        description: vacancy.employer.description
          ? sanitizeCmsHtml(vacancy.employer.description)
          : null,
      },
      questions: vacancy.questions,
    },
    eligibility,
    myApplication: myApp,
  });
}
