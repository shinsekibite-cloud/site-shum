import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { publishedWhere } from '@/lib/publish';
import DocumentViewer from '@/components/DocumentViewer';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { staticDocumentParams } from '@/lib/generate-public-static-params';

export const revalidate = 60;
export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  return staticDocumentParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const doc = await prisma.siteDocument.findFirst({
    where: { id, ...publishedWhere() },
    select: { title: true, description: true },
  });
  if (!doc) return { title: 'Документ не найден' };
  return {
    title: doc.title,
    description: doc.description || undefined,
  };
}

export default async function DocumentViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await prisma.siteDocument.findFirst({
    where: { id, ...publishedWhere() },
  });
  if (!doc) notFound();

  return (
    <div style={{ padding: '1rem 0 3rem', minHeight: '70vh', background: '#f1f5f9' }}>
      <div className="container" style={{ padding: '0 0.75rem' }}>
        <Link
          href="/documents"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--muted)',
            textDecoration: 'none',
            fontWeight: 600,
            marginBottom: '1rem',
          }}
        >
          <ArrowLeft size={16} /> К списку документов
        </Link>

        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {doc.category}
          </div>
          <h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, margin: '0.35rem 0' }}>{doc.title}</h1>
          {doc.description && (
            <p style={{ color: '#475569', margin: 0, lineHeight: 1.6, maxWidth: 720 }}>{doc.description}</p>
          )}
        </div>

        <DocumentViewer
          documentId={doc.id}
          fileUrl={doc.fileUrl}
          mimeType={doc.mimeType}
          title={doc.title}
          fileName={doc.fileName}
        />
      </div>
    </div>
  );
}
