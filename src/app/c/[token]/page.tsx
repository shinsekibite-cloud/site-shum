import Link from 'next/link';
import { resolvePresenceToken, maskDisplayName } from '@/lib/presence-qr';

export const dynamic = 'force-dynamic';

export default async function PresenceTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolvePresenceToken(decodeURIComponent(token));

  if (!resolved.ok) {
    return (
      <div className="container" style={{ padding: '3rem 1rem', maxWidth: 520 }}>
        <h1>QR недействителен</h1>
        <p>{resolved.message}</p>
        <p style={{ marginTop: '1rem' }}>
          <Link href="/dashboard" className="btn btn-primary">
            Обновить в кабинете
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '3rem 1rem', maxWidth: 520 }}>
      <h1>Пропуск участника</h1>
      <p>
        {maskDisplayName(resolved.user.name)}
        {resolved.user.publicCode ? ` · ${resolved.user.publicCode}` : ''}
      </p>
      <p className="presence-muted" style={{ marginTop: '0.75rem' }}>
        Для чек-ина отсканируйте этот QR на странице сотрудника /scan.
      </p>
      <p style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link href="/scan" className="btn btn-primary">
          Открыть сканер
        </Link>
        <Link href="/dashboard" className="btn btn-secondary">
          В кабинет
        </Link>
      </p>
    </div>
  );
}
