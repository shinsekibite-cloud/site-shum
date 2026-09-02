import ProgramListPage, { makeProgramListMetadata } from '@/components/programs/ProgramListPage';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata() {
  return makeProgramListMetadata('GRANT');
}

export default async function GrantsPage() {
  return <ProgramListPage kind="GRANT" />;
}
