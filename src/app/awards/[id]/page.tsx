import { getServerSession } from 'next-auth';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { OFFICIAL_DOC_TYPE_META } from '@/lib/official-documents-shared';
import { getSiteIdentity } from '@/lib/site-identity';
import { Download } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function AwardViewPage({ params }: Props) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const doc = await prisma.officialDocument.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!doc || doc.status === 'REVOKED') notFound();

  const role = session?.user?.role;
  const isOwner = session?.user?.id === doc.userId;
  const isStaff = role === 'ADMIN' || role === 'MODERATOR' || role === 'TECH';
  if (!isOwner && !isStaff) notFound();

  const { siteName } = await getSiteIdentity();
  const meta = OFFICIAL_DOC_TYPE_META[doc.type];
  const dateStr = doc.issuedAt.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="container" style={{ padding: '1.5rem 1rem 3rem', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <div className="yp-award-card__type">{meta.label}</div>
          <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.4rem' }}>{doc.title}</h1>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
            № {doc.serialNumber} · {dateStr}
          </p>
        </div>
        <div className="yp-award-actions">
          <a className="btn btn-primary" href={`/api/awards/${doc.id}/pdf`} target="_blank" rel="noreferrer">
            <Download size={16} /> Скачать PDF
          </a>
          <Link className="btn btn-secondary" href="/dashboard/awards">
            Мои награды
          </Link>
        </div>
      </div>

      <div className="yp-award-frame" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="yp-award-frame__org">{doc.issuerName || siteName}</div>
        <div className="yp-award-card__type">{meta.label}</div>
        {doc.subtitle ? <div style={{ color: '#64748b', fontSize: '0.9rem' }}>{doc.subtitle}</div> : null}
        <p style={{ margin: '0.5rem 0 0', color: '#64748b' }}>награждается</p>
        <div className="yp-award-frame__name">{doc.recipientName || doc.user.name || 'Участник'}</div>
        <p className="yp-award-frame__title">{doc.body || doc.title}</p>
        <div style={{ marginTop: 'auto', width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b' }}>
          <span>{dateStr}</span>
          <span>{doc.serialNumber}</span>
        </div>
      </div>

      <iframe
        title="Просмотр PDF"
        src={`/api/awards/${doc.id}/pdf`}
        style={{
          width: '100%',
          minHeight: 480,
          marginTop: '1.25rem',
          border: '1px solid rgba(15,23,42,0.08)',
          borderRadius: 12,
          background: '#f8fafc',
        }}
      />
    </div>
  );
}
