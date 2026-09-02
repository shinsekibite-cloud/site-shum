import ContestsClient from '@/components/ContestsClient';

export const metadata = { title: 'Конкурсы и розыгрыши' };
export const revalidate = 60;
export const dynamic = 'force-static';

export default async function ContestsPage() {
  return <ContestsClient />;
}
