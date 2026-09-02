/** Client-safe program catalog helpers (no Prisma). */

export const PROGRAM_KINDS = ['GRANT', 'DOBRO', 'SELF_GOV'] as const;
export type ProgramKind = (typeof PROGRAM_KINDS)[number];

export const PROGRAM_KIND_META: Record<
  ProgramKind,
  {
    slug: string;
    title: string;
    singular: string;
    applyLabel: string;
    approvedLabel: string;
    listDescription: string;
    adminTitle: string;
  }
> = {
  GRANT: {
    slug: 'grants',
    title: 'Гранты',
    singular: 'грант',
    applyLabel: 'Подать заявку на грант',
    approvedLabel: 'Заявка принята',
    listDescription:
      'Конкурсы и программы поддержки молодёжных инициатив Сочи: сроки, условия и подача заявки на портале.',
    adminTitle: 'Грантовые программы',
  },
  DOBRO: {
    slug: 'dobro',
    title: 'Добро',
    singular: 'акция',
    applyLabel: 'Записаться волонтёром',
    approvedLabel: 'Вы в команде',
    listDescription:
      'Волонтёрские акции и наборы Добро.Центра Сочи: смены, городские события и помощь городу.',
    adminTitle: 'Волонтёрские акции',
  },
  SELF_GOV: {
    slug: 'self-gov',
    title: 'Самоуправление',
    singular: 'орган',
    applyLabel: 'Подать заявку на участие',
    approvedLabel: 'Вы участник',
    listDescription:
      'Молодёжный совет, парламент и ученическое самоуправление — влияние на решения, важные для молодых жителей.',
    adminTitle: 'Самоуправление',
  },
};

export const PROGRAM_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  OPEN: 'Открыт набор',
  CLOSED: 'Набор закрыт',
  ARCHIVED: 'В архиве',
};

export const BODY_TYPE_LABELS: Record<string, string> = {
  COUNCIL: 'Молодёжный совет',
  PARLIAMENT: 'Молодёжный парламент',
  SCHOOL: 'Ученическое самоуправление',
  INITIATIVE: 'Инициативная группа',
};

export function programPublicPath(kind: ProgramKind, id?: string) {
  const base = `/${PROGRAM_KIND_META[kind].slug}`;
  return id ? `${base}/${id}` : base;
}

export function formatProgramDate(d: Date | string | null | undefined) {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
