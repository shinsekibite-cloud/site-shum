import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import PageEditorForm from '../../PageEditorForm';
import { requirePermissionPage } from '@/lib/acl';

export default async function EditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requirePermissionPage('pages');
  const { id } = await params;
  const sp = await searchParams;
  const page = await prisma.pageContent.findUnique({ where: { id } });
  if (!page) notFound();

  return (
    <PageEditorForm
      mode="edit"
      page={page}
      saved={sp.saved === '1'}
      error={sp.error === '1'}
    />
  );
}
