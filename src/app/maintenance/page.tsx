import { getMaintenanceState } from '@/lib/maintenance';
import MaintenanceScreen from '@/components/MaintenanceScreen';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Проводятся работы',
  robots: { index: false, follow: false },
};

export default async function MaintenancePage() {
  const state = await getMaintenanceState();
  return <MaintenanceScreen state={state} />;
}
