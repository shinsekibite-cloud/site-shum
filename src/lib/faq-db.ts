import { prisma } from '@/lib/prisma';
import type { FaqCategory } from '@/lib/faq-content';
import { isNextBuildPhase } from '@/lib/build-phase';

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `cat-${Date.now().toString(36)}`;
}

export async function getPublishedFaqCategories(): Promise<FaqCategory[]> {
  if (isNextBuildPhase()) return [];
  const rows = await prisma.faqCategory.findMany({
    where: { published: true },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    include: {
      items: {
        where: { published: true },
        orderBy: [{ sortOrder: 'asc' }, { question: 'asc' }],
        select: { question: true, answer: true },
      },
    },
  });
  return rows
    .filter((c) => c.items.length > 0)
    .map((c) => ({
      id: c.slug || c.id,
      title: c.title,
      items: c.items.map((i) => ({ q: i.question, a: i.answer })),
    }));
}

export async function listFaqAdmin() {
  return prisma.faqCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    include: {
      items: { orderBy: [{ sortOrder: 'asc' }, { question: 'asc' }] },
      _count: { select: { items: true } },
    },
  });
}

export { slugify };
