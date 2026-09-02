import { verifyPortfolioSignature } from '@/lib/portfolio';

export default async function PortfolioVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; h?: string; t?: string; s?: string }>;
}) {
  const sp = await searchParams;
  const u = sp.u || '';
  const h = sp.h || '';
  const t = sp.t || '';
  const s = sp.s || '';
  const ok =
    Boolean(u && h && t && s) &&
    verifyPortfolioSignature({ userId: u, contentHash: h, issuedAt: t, signature: s });

  return (
    <div className="cms-page-shell" style={{ padding: '3rem 1rem', maxWidth: 560 }}>
      <h1 className="text-gradient">Проверка подписи портфолио</h1>
      {ok ? (
        <p style={{ color: '#166534', fontWeight: 650 }}>Подпись действительна. Документ выдан порталом.</p>
      ) : (
        <p style={{ color: '#991b1b', fontWeight: 650 }}>Подпись не подтверждена или ссылка повреждена.</p>
      )}
      <dl style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.6 }}>
        <dt>Пользователь</dt>
        <dd>{u || '—'}</dd>
        <dt>Хеш</dt>
        <dd style={{ wordBreak: 'break-all' }}>{h || '—'}</dd>
        <dt>Выдано</dt>
        <dd>{t || '—'}</dd>
      </dl>
    </div>
  );
}
