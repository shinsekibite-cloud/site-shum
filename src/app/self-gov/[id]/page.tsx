import ProgramDetailPage, { makeProgramDetailMetadata } from '@/components/programs/ProgramDetailPage';
import { staticProgramParams } from '@/lib/generate-public-static-params';

export const revalidate = 60;
export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  return staticProgramParams('SELF_GOV');
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return makeProgramDetailMetadata('SELF_GOV', id);
}

export default async function SelfGovDetail({ params }: { params: Promise<{ id: string }> }) {
  return <ProgramDetailPage kind="SELF_GOV" params={params} />;
}
