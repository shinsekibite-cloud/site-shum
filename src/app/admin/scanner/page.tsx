import TicketScanner from '@/components/TicketScanner';
import OrgEntranceQr from '@/components/OrgEntranceQr';
import ScannerErrorBoundary from '@/components/ScannerErrorBoundary';
import { requirePermissionPage } from '@/lib/acl';
import { buildOrgEntranceCheckInUrl, buildOrgEntranceCode } from '@/lib/tickets';

export const metadata = {
  title: 'Сканер билетов',
};

export default async function AdminScannerPage() {
  await requirePermissionPage('scanner');

  const orgUrl = buildOrgEntranceCheckInUrl();
  const orgCode = buildOrgEntranceCode();

  return (
    <div className="admin-scanner-page">
      <details className="admin-scanner-page__org-details card-surface">
        <summary className="admin-scanner-page__org-summary">
          QR на вход в организацию — для печати у двери
        </summary>
        <OrgEntranceQr url={orgUrl} codeLabel={orgCode} />
      </details>
      <div className="admin-scanner-page__scanner">
        <ScannerErrorBoundary>
          <TicketScanner />
        </ScannerErrorBoundary>
      </div>
    </div>
  );
}
