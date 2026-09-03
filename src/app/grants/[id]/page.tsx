import ProgramDetailPage, { makeProgramDetailMetadata } from '@/components/programs/ProgramDetailPage';
import { staticProgramParams } from '@/lib/generate-public-static-params';

export const revalidate = 60;
export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  return staticProgramParams('GRANT');
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return makeProgramDetailMetadata('GRANT', id);
}

export default async function GrantDetail({ params }: { params: Promise<{ id: string }> }) {
  return <ProgramDetailPage kind="GRANT" params={params} />;
}
