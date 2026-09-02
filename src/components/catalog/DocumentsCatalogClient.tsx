'use client';

import Link from 'next/link';
import { FileText, Eye, Download } from 'lucide-react';
import { useMemo } from 'react';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import type { PublicDocumentCard } from '@/lib/public-catalogs';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function mimeLabel(mime: string) {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'Word';
  if (mime.startsWith('image/')) return 'Изображение';
  if (mime === 'text/plain') return 'Текст';
  return 'Файл';
}

export default function DocumentsCatalogClient({ items }: { items: PublicDocumentCard[] }) {
  const sp = useSafeSearchParams();
  const category = (sp.get('category') || '').trim();
  const docs = useMemo(
    () => (category ? items.filter((d) => d.category === category) : items),
    [items, category]
  );
  const allCats = useMemo(
    () => [...new Set(items.map((d) => d.category))].sort((a, b) => a.localeCompare(b, 'ru')),
    [items]
  );

  return (
    <div className="container docs-page-shell" style={{ padding: '2rem 1rem', minHeight: '60vh' }}>
      <div>
        <h1 className="page-hero-title">Документы</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '1.75rem', fontSize: '1.05rem' }}>
          Положения, формы и правила портала. Откройте документ прямо на сайте или скачайте файл.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <Link
            href="/documents"
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: 999,
              fontWeight: 600,
              fontSize: '0.85rem',
              textDecoration: 'none',
              background: !category ? 'var(--primary)' : 'rgba(15,23,42,0.05)',
              color: !category ? 'white' : 'var(--foreground)',
            }}
          >
            Все
          </Link>
          {allCats.map((c) => (
            <Link
              key={c}
              href={`/documents?category=${encodeURIComponent(c)}`}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: 999,
                fontWeight: 600,
                fontSize: '0.85rem',
                textDecoration: 'none',
                background: category === c ? 'var(--primary)' : 'rgba(15,23,42,0.05)',
                color: category === c ? 'white' : 'var(--foreground)',
              }}
            >
              {c}
            </Link>
          ))}
        </div>

        {docs.length === 0 ? (
          <div
            style={{
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              background: 'white',
              borderRadius: 16,
              color: 'var(--muted)',
              border: '1px solid rgba(0,0,0,0.05)',
            }}
          >
            В этом разделе пока нет опубликованных документов.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {docs.map((doc) => (
              <article
                key={doc.id}
                style={{
                  background: 'white',
                  borderRadius: 16,
                  border: '1px solid rgba(15,23,42,0.06)',
                  padding: '1.15rem 1.25rem',
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  boxShadow: '0 4px 20px rgba(15,23,42,0.04)',
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(14,165,233,0.12))',
                    color: 'var(--primary)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <FileText size={24} />
                </div>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {doc.category} · {mimeLabel(doc.mimeType)} · {formatSize(doc.sizeBytes)}
                  </div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0.25rem 0' }}>
                    <Link href={`/documents/${doc.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {doc.title}
                    </Link>
                  </h2>
                  {doc.description && (
                    <p style={{ margin: 0, color: '#475569', lineHeight: 1.55 }}>{doc.description}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Link href={`/documents/${doc.id}`} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Eye size={16} /> Смотреть
                  </Link>
                  <a
                    href={`/api/documents/${doc.id}/file?disposition=attachment`}
                    className="btn btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Download size={16} /> Скачать
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
