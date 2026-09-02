import PageEditorForm from '../PageEditorForm';
import { requirePermissionPage } from '@/lib/acl';

export default async function NewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermissionPage('pages');
  const params = await searchParams;
  return <PageEditorForm mode="create" error={params.error === '1'} />;
}
