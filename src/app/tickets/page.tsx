import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import TicketsHub from '@/components/TicketsHub';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Мои билеты',
  description: 'QR-билеты на мероприятия — покажите на входе или сохраните в календарь.',
};

export default async function TicketsPage() {
  await getServerSession(authOptions);
  return (
    <div className="container tickets-page">
      <TicketsHub standalone />
    </div>
  );
}
