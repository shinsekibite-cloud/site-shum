'use client';

import dynamic from 'next/dynamic';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { isOfficeDoc } from '@/lib/document-types';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: '3rem', textAlign: 'center', color: '#475569', fontWeight: 600 }}>Загрузка PDF…</div>
  ),
});

const DocxViewer = dynamic(() => import('@/components/DocxViewer'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: '3rem', textAlign: 'center', color: '#475569', fontWeight: 600 }}>Загрузка документа…</div>
  ),
});

type Props = {
  documentId: string;
  fileUrl: string;
  mimeType: string;
  title: string;
  fileName: string;
};

function isDocx(mimeType: string, fileName: string) {
  const lower = fileName.toLowerCase();
  return (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  );
}

function isLegacyDoc(mimeType: string, fileName: string) {
  const lower = fileName.toLowerCase();
  return (
    (mimeType === 'application/msword' || mimeType === 'application/vnd.ms-word' || lower.endsWith('.doc')) &&
    !lower.endsWith('.docx')
  );
}

function TextViewer({ url }: { url: string }) {
  const [textBody, setTextBody] = useState<string | null>(null);
  const [textError, setTextError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('Не удалось загрузить файл');
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setTextBody(t);
      })
      .catch((e: Error) => {
        if (!cancelled) setTextError(e.message || 'Ошибка загрузки');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <pre
      style={{
        margin: 0,
        padding: '1.25rem',
        color: '#0f172a',
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        fontSize: '0.95rem',
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        minHeight: '40vh',
      }}
    >
      {textError || textBody || 'Загрузка…'}
    </pre>
  );
}

export default function DocumentViewer({ documentId, fileUrl, mimeType, title, fileName }: Props) {
  const inlineUrl = useMemo(
    () => `/api/documents/${documentId}/file?disposition=inline`,
    [documentId]
  );
  const downloadUrl = useMemo(
    () => `/api/documents/${documentId}/file?disposition=attachment`,
    [documentId]
  );
  /** Same-site viewer — avoids Android downloading raw PDF instead of opening. */
  const newTabUrl = useMemo(() => `/documents/${documentId}`, [documentId]);

  const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  const isImage = mimeType.startsWith('image/');
  const isText = mimeType === 'text/plain' || fileName.toLowerCase().endsWith('.txt');
  const docx = isDocx(mimeType, fileName);
  const legacyDoc = isLegacyDoc(mimeType, fileName);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
          <FileText size={16} />
          <span style={{ wordBreak: 'break-all' }}>{fileName}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <a
            href={downloadUrl}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 0.9rem' }}
          >
            <Download size={16} /> Скачать
          </a>
          <a
            href={newTabUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 0.9rem' }}
          >
            <ExternalLink size={16} /> Открыть в новой вкладке
          </a>
        </div>
      </div>

      {isPdf && <PdfViewer url={inlineUrl} title={title} />}

      {docx && <DocxViewer url={inlineUrl} />}

      {legacyDoc && (
        <div
          style={{
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            background: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            color: '#334155',
            lineHeight: 1.55,
          }}
        >
          <p style={{ margin: '0 0 0.75rem', fontWeight: 700 }}>Предпросмотр .doc на сайте недоступен</p>
          <p style={{ margin: 0, color: '#64748b' }}>
            Старый формат Word (.doc) не открывается без внешних сервисов. Загрузите файл как <strong>.docx</strong> или
            скачайте и откройте на устройстве.
          </p>
        </div>
      )}

      {isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fileUrl}
          alt={title}
          style={{
            display: 'block',
            maxWidth: '100%',
            height: 'auto',
            margin: '0 auto',
            borderRadius: 12,
            background: '#0f172a',
          }}
        />
      )}

      {isText && <TextViewer url={inlineUrl} />}

      {!isPdf && !docx && !legacyDoc && !isImage && !isText && (
        <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
          Предпросмотр для этого формата недоступен. Скачайте файл.
        </div>
      )}

      {(isPdf || docx || isOfficeDoc(mimeType, fileName)) && (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
          Документы открываются на сайте без внешних сервисов. PDF — чёткий просмотр; DOCX — вёрстка как в Word.
        </p>
      )}
    </div>
  );
}
