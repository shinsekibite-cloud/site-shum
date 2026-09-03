import ProgramListPage, { makeProgramListMetadata } from '@/components/programs/ProgramListPage';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata() {
  return makeProgramListMetadata('SELF_GOV');
}

export default async function SelfGovPage() {
  return <ProgramListPage kind="SELF_GOV" />;
}
