'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertCleanText, ProfanityError } from '@/lib/censor';
import { saveUploadedImage } from '@/lib/uploads';
import { requirePermission } from '@/lib/acl';
import { parsePublishFields } from '@/lib/publish';
import { isSystemPageSlug, publicPagePath } from '@/lib/system-pages';

async function processImage(formData: FormData) {
  const file = formData.get('imageFile') as File | null;
  // CoverImageField writes the cover URL to `images`; empty string means cleared.
  const imageUrl = (formData.get('images') as string) || '';
  // Ignore placeholder JSON like "[]"; treat empty as cleared cover.
  const fallback = imageUrl && imageUrl !== '[]' ? imageUrl : '';
  return saveUploadedImage(file, 'pages', fallback);
}

function revalidatePagePaths(slug: string) {
  revalidatePath('/admin/pages');
  revalidatePath(publicPagePath(slug));
  revalidatePath(`/p/${slug}`);
  if (slug === 'privacy') {
    revalidatePath('/privacy');
    revalidatePath('/privacy/verify');
    revalidatePath('/api/privacy/download');
    revalidatePath('/rules');
  }
}

export async function deletePage(formData: FormData) {
  await requirePermission('pages');
  const id = formData.get('id') as string;
  try {
    const page = await prisma.pageContent.findUnique({ where: { id } });
    if (page && isSystemPageSlug(page.slug)) {
      return;
    }
    await prisma.pageContent.delete({ where: { id } });
    revalidatePath('/admin/pages');
    if (page) revalidatePagePaths(page.slug);
  } catch (e) {
    console.error('Ошибка удаления', e);
  }
}

export async function createPage(formData: FormData) {
  await requirePermission('pages');
  try {
    const slug = (formData.get('slug') as string).trim().toLowerCase().replace(/\s+/g, '-');
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const template = (formData.get('template') as string) || 'DEFAULT';
    const menuPosition = (formData.get('menuPosition') as string) || 'NONE';
    assertCleanText(slug, title, content);
    const imagePath = await processImage(formData);
    const { status, publishedAt } = parsePublishFields(formData);
    const created = await prisma.pageContent.create({
      data: { slug, title, content, images: imagePath, menuPosition, template, status, publishedAt },
    });
    revalidatePagePaths(slug);
    redirect(`/admin/pages/${created.id}/edit?saved=1`);
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    if ((e as any)?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    console.error('Ошибка создания', e);
    redirect('/admin/pages/new?error=1');
  }
}

export async function updatePage(formData: FormData) {
  await requirePermission('pages');
  const id = formData.get('id') as string;
  try {
    const existing = await prisma.pageContent.findUnique({ where: { id } });
    let slug = (formData.get('slug') as string).trim().toLowerCase().replace(/\s+/g, '-');
    // Keep system page slugs fixed so /privacy and /p/about keep working.
    if (existing && isSystemPageSlug(existing.slug)) {
      slug = existing.slug;
    }
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const template = (formData.get('template') as string) || 'DEFAULT';
    const menuPosition = (formData.get('menuPosition') as string) || 'NONE';
    assertCleanText(slug, title, content);
    const imagePath = await processImage(formData);
    const { status, publishedAt } = parsePublishFields(formData);
    await prisma.pageContent.update({
      where: { id },
      data: { slug, title, content, images: imagePath, menuPosition, template, status, publishedAt },
    });
    revalidatePagePaths(slug);
    if (existing && existing.slug !== slug) revalidatePagePaths(existing.slug);
    redirect(`/admin/pages/${id}/edit?saved=1`);
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    if ((e as any)?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    console.error('Ошибка обновления', e);
    redirect(`/admin/pages/${id}/edit?error=1`);
  }
}
