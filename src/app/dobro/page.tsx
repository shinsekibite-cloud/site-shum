import ProgramListPage, { makeProgramListMetadata } from '@/components/programs/ProgramListPage';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata() {
  return makeProgramListMetadata('DOBRO');
}

export default async function DobroPage() {
  return <ProgramListPage kind="DOBRO" />;
}
