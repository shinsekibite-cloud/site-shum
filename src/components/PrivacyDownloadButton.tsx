'use client';

import { Download, FileText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function PrivacyDownloadButton({ dark = false }: { dark?: boolean }) {
  return (
    <div className="legal-dl-actions">
      <a
        href="/api/privacy/download?format=html"
        className="btn btn-primary"
        style={{ gap: 8, width: '100%', justifyContent: 'center' }}
      >
        <Download size={18} />
        Скачать HTML
      </a>
      <a
        href="/api/privacy/download?format=txt"
        className="btn btn-secondary"
        style={{ gap: 8, width: '100%', justifyContent: 'center' }}
      >
        <FileText size={18} />
        Скачать TXT
      </a>
      <p
        className="legal-dl-hint"
        style={{
          margin: 0,
          fontSize: '0.78rem',
          color: dark ? undefined : 'var(--muted)',
          lineHeight: 1.45,
          textAlign: 'left',
          flex: '1 1 100%',
        }}
      >
        На Android удобнее HTML. TXT сохранён в UTF-16, чтобы кириллица не превращалась в «кракозябры».
      </p>
      <Link
        href="/privacy/verify"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '0.88rem',
          fontWeight: 650,
          color: dark ? '#bfdbfe' : 'var(--primary)',
          textDecoration: 'none',
        }}
      >
        <ShieldCheck size={16} />
        Проверить подлинность
      </Link>
    </div>
  );
}
