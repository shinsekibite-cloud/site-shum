import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/acl';
import { slugify } from '@/lib/faq-db';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

function revalidateFaq() {
  try {
    revalidatePath('/faq');
  } catch {
    /* ignore */
  }
}

export async function GET() {
  await requirePermission('pages');
  const categories = await prisma.faqCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    include: {
      items: { orderBy: [{ sortOrder: 'asc' }, { question: 'asc' }] },
    },
  });
  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  await requirePermission('pages');
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || 'category');

  if (kind === 'category') {
    const title = String(body.title || '').trim().slice(0, 120);
    if (!title) return NextResponse.json({ message: 'Укажите название категории' }, { status: 400 });
    let slug = String(body.slug || '').trim() || slugify(title);
    slug = slugify(slug);
    const exists = await prisma.faqCategory.findUnique({ where: { slug } });
    if (exists) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
    const published = body.published !== false;
    const cat = await prisma.faqCategory.create({
      data: { title, slug, sortOrder, published },
    });
    revalidateFaq();
    return NextResponse.json({ category: cat });
  }

  if (kind === 'item') {
    const categoryId = String(body.categoryId || '').trim();
    const question = String(body.question || '').trim().slice(0, 500);
    const answer = String(body.answer || '').trim().slice(0, 8000);
    if (!categoryId || !question || !answer) {
      return NextResponse.json({ message: 'Нужны категория, вопрос и ответ' }, { status: 400 });
    }
    const cat = await prisma.faqCategory.findUnique({ where: { id: categoryId } });
    if (!cat) return NextResponse.json({ message: 'Категория не найдена' }, { status: 404 });
    const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
    const published = body.published !== false;
    const item = await prisma.faqItem.create({
      data: { categoryId, question, answer, sortOrder, published },
    });
    revalidateFaq();
    return NextResponse.json({ item });
  }

  return NextResponse.json({ message: 'Unknown kind' }, { status: 400 });
}

export async function PATCH(req: Request) {
  await requirePermission('pages');
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || 'category');
  const id = String(body.id || '').trim();
  if (!id) return NextResponse.json({ message: 'id required' }, { status: 400 });

  if (kind === 'category') {
    const data: Record<string, unknown> = {};
    if (typeof body.title === 'string') data.title = body.title.trim().slice(0, 120);
    if (typeof body.slug === 'string' && body.slug.trim()) data.slug = slugify(body.slug);
    if (body.sortOrder != null && Number.isFinite(Number(body.sortOrder))) data.sortOrder = Number(body.sortOrder);
    if (typeof body.published === 'boolean') data.published = body.published;
    try {
      const category = await prisma.faqCategory.update({ where: { id }, data });
      revalidateFaq();
      return NextResponse.json({ category });
    } catch {
      return NextResponse.json({ message: 'Не удалось обновить категорию' }, { status: 400 });
    }
  }

  if (kind === 'item') {
    const data: Record<string, unknown> = {};
    if (typeof body.question === 'string') data.question = body.question.trim().slice(0, 500);
    if (typeof body.answer === 'string') data.answer = body.answer.trim().slice(0, 8000);
    if (typeof body.categoryId === 'string' && body.categoryId.trim()) data.categoryId = body.categoryId.trim();
    if (body.sortOrder != null && Number.isFinite(Number(body.sortOrder))) data.sortOrder = Number(body.sortOrder);
    if (typeof body.published === 'boolean') data.published = body.published;
    try {
      const item = await prisma.faqItem.update({ where: { id }, data });
      revalidateFaq();
      return NextResponse.json({ item });
    } catch {
      return NextResponse.json({ message: 'Не удалось обновить вопрос' }, { status: 400 });
    }
  }

  return NextResponse.json({ message: 'Unknown kind' }, { status: 400 });
}

export async function DELETE(req: Request) {
  await requirePermission('pages');
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || 'category');
  const id = String(body.id || '').trim();
  if (!id) return NextResponse.json({ message: 'id required' }, { status: 400 });

  if (kind === 'category') {
    await prisma.faqCategory.delete({ where: { id } }).catch(() => null);
    revalidateFaq();
    return NextResponse.json({ ok: true });
  }
  if (kind === 'item') {
    await prisma.faqItem.delete({ where: { id } }).catch(() => null);
    revalidateFaq();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ message: 'Unknown kind' }, { status: 400 });
}
