import EmployerApplyClient from '@/components/EmployerApplyClient';

export const metadata = { title: 'Стать работодателем' };
export const revalidate = 60;
export const dynamic = 'force-static';

export default async function EmployerApplyPage() {
  return <EmployerApplyClient />;
}
