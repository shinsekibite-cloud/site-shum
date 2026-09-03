import { prisma } from '@/lib/prisma';
import { INSTRUCTIONS_VERSION } from '@/lib/consent-versions';
import { isEndUserRole } from '@/lib/acl-shared';

export type EligibilityOk = { ok: true };
export type EligibilityFail = { ok: false; code: string; message: string };
export type EligibilityResult = EligibilityOk | EligibilityFail;

function ageFromBirth(d: Date | null | undefined): number | null {
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export async function checkVacancyEligibility(
  userId: string,
  vacancyId: string
): Promise<EligibilityResult & { vacancy?: Awaited<ReturnType<typeof loadVacancy>> }> {
  const roleUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      blockedAt: true,
      deletedAt: true,
      birthDate: true,
      reliabilityScore: true,
      socialScore: true,
      instructionsVersion: true,
      instructionsCompletedAt: true,
    },
  });
  if (!roleUser || roleUser.deletedAt) {
    return { ok: false, code: 'NO_USER', message: 'Войдите в аккаунт' };
  }
  if (roleUser.blockedAt) {
    return { ok: false, code: 'BLOCKED', message: 'Аккаунт заблокирован' };
  }
  if (!isEndUserRole(roleUser.role)) {
    return { ok: false, code: 'ROLE', message: 'Сервисная учётка не может откликаться на вакансии' };
  }

  const vacancy = await loadVacancy(vacancyId);
  if (!vacancy) {
    return { ok: false, code: 'NOT_FOUND', message: 'Вакансия не найдена' };
  }
  if (vacancy.status !== 'OPEN') {
    return { ok: false, code: 'CLOSED', message: 'Набор на вакансию закрыт' };
  }
  if (vacancy.employer.status !== 'APPROVED') {
    return { ok: false, code: 'EMPLOYER', message: 'Работодатель не активен' };
  }
  const now = Date.now();
  if (vacancy.opensAt && vacancy.opensAt.getTime() > now) {
    return { ok: false, code: 'NOT_STARTED', message: 'Приём откликов ещё не начался' };
  }
  if (vacancy.closesAt && vacancy.closesAt.getTime() < now) {
    return { ok: false, code: 'CLOSED', message: 'Срок подачи откликов истёк' };
  }

  const age = ageFromBirth(roleUser.birthDate);
  if (vacancy.ageMin != null || vacancy.ageMax != null) {
    if (age == null) {
      return { ok: false, code: 'AGE_UNKNOWN', message: 'Укажите дату рождения в профиле' };
    }
    if (vacancy.ageMin != null && age < vacancy.ageMin) {
      return { ok: false, code: 'AGE', message: `Минимальный возраст: ${vacancy.ageMin}` };
    }
    if (vacancy.ageMax != null && age > vacancy.ageMax) {
      return { ok: false, code: 'AGE', message: `Максимальный возраст: ${vacancy.ageMax}` };
    }
  }

  if ((roleUser.reliabilityScore ?? 100) < vacancy.minReliability) {
    return {
      ok: false,
      code: 'RELIABILITY',
      message: `Нужен авторитет не ниже ${vacancy.minReliability}`,
    };
  }
  if ((roleUser.socialScore ?? 50) < vacancy.minSocial) {
    return {
      ok: false,
      code: 'SOCIAL',
      message: `Нужен соцрейтинг не ниже ${vacancy.minSocial}`,
    };
  }

  if (vacancy.needInstructions) {
    if (
      !roleUser.instructionsCompletedAt ||
      roleUser.instructionsVersion !== INSTRUCTIONS_VERSION
    ) {
      return {
        ok: false,
        code: 'INSTRUCTIONS',
        message: 'Пройдите актуальный инструктаж в профиле',
      };
    }
  }

  if (vacancy.seats != null) {
    const approved = await prisma.vacancyApplication.count({
      where: { vacancyId, status: 'APPROVED' },
    });
    if (approved >= vacancy.seats) {
      return { ok: false, code: 'SEATS', message: 'Свободных мест больше нет' };
    }
  }

  return { ok: true, vacancy };
}

async function loadVacancy(id: string) {
  return prisma.vacancy.findUnique({
    where: { id },
    include: {
      employer: true,
      questions: { orderBy: { sortOrder: 'asc' } },
    },
  });
}

type AnswerMap = Record<string, unknown>;

export function scoreVacancyAnswers(
  questions: Array<{
    id: string;
    kind: string;
    correctJson: string | null;
    weight: number;
    knockout: boolean;
  }>,
  answers: AnswerMap
): { score: number; maxScore: number; percent: number; knockoutFailed: boolean; detail: string[] } {
  let score = 0;
  let maxScore = 0;
  let knockoutFailed = false;
  const detail: string[] = [];

  for (const q of questions) {
    const w = Math.max(1, q.weight || 1);
    maxScore += w;
    let expected: unknown = null;
    try {
      expected = q.correctJson ? JSON.parse(q.correctJson) : null;
    } catch {
      expected = null;
    }
    const given = answers[q.id];
    let ok = false;

    if (q.kind === 'text') {
      // Soft: non-empty text always counts if no correctJson
      if (expected == null) {
        ok = typeof given === 'string' && given.trim().length >= 3;
      } else {
        ok =
          typeof given === 'string' &&
          given.trim().toLowerCase() === String(expected).trim().toLowerCase();
      }
    } else if (q.kind === 'number') {
      ok = Number(given) === Number(expected);
    } else if (q.kind === 'bool') {
      ok = Boolean(given) === Boolean(expected);
    } else if (q.kind === 'multi') {
      const exp = Array.isArray(expected) ? expected.map(String).sort() : [];
      const got = Array.isArray(given) ? given.map(String).sort() : [];
      ok = JSON.stringify(exp) === JSON.stringify(got);
    } else {
      // single
      ok = String(given ?? '') === String(expected ?? '');
    }

    if (ok) {
      score += w;
    } else {
      detail.push(q.id);
      if (q.knockout) knockoutFailed = true;
    }
  }

  const percent = maxScore ? Math.round((score / maxScore) * 100) : 100;
  return { score, maxScore, percent, knockoutFailed, detail };
}
