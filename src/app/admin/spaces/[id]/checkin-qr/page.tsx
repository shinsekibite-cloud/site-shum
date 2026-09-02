import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { requirePermissionPage } from '@/lib/acl';
import { buildVenueCheckInUrl, buildVenueCode } from '@/lib/tickets';

export default async function VenueCheckInQrPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionPage('spaces');
  const { id } = await params;
  const space = await prisma.space.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!space) notFound();

  const { getSiteIdentity } = await import('@/lib/site-identity');
  const { publicOrigin: origin } = await getSiteIdentity();
  const url = buildVenueCheckInUrl(space.id, origin);
  const code = buildVenueCode(space.id);
  const qrDataUrl = await QRCode.toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: 'M' });

  return (
    <div>
      <div style={{ padding: '1rem 1.25rem' }}>
        <Link href="/admin/spaces" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          ← К пространствам
        </Link>
      </div>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem 1rem 3rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>Постоянный QR на вход</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          {space.title}. Распечатайте и повесьте у входа — код постоянный. Авторизованный участник
          может отметиться: за час до начала, в любой момент пока идёт мероприятие, и ещё 10 минут
          после конца. Если сегодня несколько записей — берём идущее сейчас, иначе ближайшее
          (стыковка 10 мин: после 10:00–11:00 следующее с 11:10). Проверяющему на `/scanner` —
          «Проход!» с именем.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt={`QR check-in ${space.title}`}
          width={280}
          height={280}
          style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff' }}
        />
        <p style={{ marginTop: '1rem', fontSize: '0.78rem', color: '#64748b', wordBreak: 'break-all' }}>{url}</p>
        <p style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>{code}</p>
        <a href={qrDataUrl} download={`checkin-${space.id}.png`} className="btn btn-primary" style={{ marginTop: 12, display: 'inline-flex' }}>
          Скачать PNG
        </a>
      </div>
    </div>
  );
}
