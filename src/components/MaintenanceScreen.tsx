import Link from 'next/link';
import type { MaintenanceState } from '@/lib/maintenance';
import { DEFAULT_LOGO } from '@/components/SiteBrand';
import EtaCountdown from '@/components/EtaCountdown';

export default function MaintenanceScreen({
  state,
  showStaffLogin = false,
}: {
  state: MaintenanceState;
  showStaffLogin?: boolean;
}) {
  return (
    <div className="maintenance-screen">
      <div className="maintenance-card card-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.logoUrl || DEFAULT_LOGO}
          alt=""
          width={64}
          height={64}
          style={{ width: 64, height: 64, objectFit: 'contain', margin: '0 auto 0.75rem', display: 'block' }}
        />
        <p className="maintenance-brand text-gradient">{state.siteName}</p>
        <h1>На сайте проводятся работы</h1>
        <p className="maintenance-message">{state.maintenanceMessage}</p>
        <EtaCountdown eta={state.maintenanceEta} prefix="До окончания" doneLabel="Работы скоро завершатся — обновите страницу" />
        <div className="maintenance-actions">
          <Link href="/" className="btn btn-primary">
            Обновить
          </Link>
          {showStaffLogin && (
            <Link href="/login?callbackUrl=%2Fadmin&staff=1" className="btn btn-secondary">
              Вход для сотрудников
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

