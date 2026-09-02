'use client';

import QRCodeDisplay from '@/components/QRCodeDisplay';

type Props = {
  /** Full check-in URL — must be generated on the server (HMAC needs NEXTAUTH_SECRET). */
  url: string;
  /** Optional short code label under the QR */
  codeLabel?: string;
};

/** Permanent organization entrance QR — print and place at the door. */
export default function OrgEntranceQr({ url, codeLabel }: Props) {
  const code =
    codeLabel ||
    (url.includes('code=') ? decodeURIComponent(url.split('code=')[1] || '') : url);

  return (
    <div className="org-entrance-qr glass">
      <h3 className="org-entrance-qr__title">QR на вход в организацию</h3>
      <p className="org-entrance-qr__lead">
        Один код на всех дверях. Гость сканирует → билет активируется, если есть запись на сегодня.
      </p>
      <div className="org-entrance-qr__code-wrap">
        <QRCodeDisplay value={url} size={160} />
      </div>
      <p className="org-entrance-qr__hint">Распечатайте и повесьте у входа. Работает с телефона участника.</p>
      <div className="org-entrance-qr__actions">
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
          Открыть ссылку
        </a>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Печать QR
        </button>
      </div>
      {code ? <code className="org-entrance-qr__raw">{code.slice(0, 48)}…</code> : null}
    </div>
  );
}
