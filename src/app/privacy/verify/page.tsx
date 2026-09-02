import Link from 'next/link';
import { CheckCircle2, XCircle, Shield } from 'lucide-react';
import {
  getPrivacyCmsContent,
  privacyContentHash,
  privacySource,
  verifyPrivacySignature,
} from '@/lib/privacy-document';
import { applySitePlaceholders, getSiteIdentity } from '@/lib/site-identity';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ v?: string; h?: string; t?: string; s?: string }>;
};

export default async function PrivacyVerifyPage({ searchParams }: Props) {
  const sp = await searchParams;
  const version = (sp.v || '').trim();
  const contentHash = (sp.h || '').trim().toLowerCase();
  const issuedAt = (sp.t || '').trim();
  const signature = (sp.s || '').trim();

  const identity = await getSiteIdentity();
  const cms = await getPrivacyCmsContent();
  const body = applySitePlaceholders(cms.body, identity);
  const policyUrl = privacySource(identity.publicOrigin);
  const hasParams = Boolean(version && contentHash && issuedAt && signature);
  const expectedHash = privacyContentHash(body, cms.version);
  const hashMatchesCurrent = contentHash === expectedHash && version === cms.version;
  const signatureOk =
    hasParams &&
    verifyPrivacySignature({
      contentHash,
      version,
      issuedAt,
      signature,
    });

  const ok = hasParams && signatureOk;

  return (
    <div className="container" style={{ padding: '1.5rem 1rem' }}>
      <div
        className="glass"
        style={{
          padding: '1.5rem',
          borderRadius: 16,
          border: `1px solid ${ok ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.2)'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Shield size={22} color={ok ? '#16a34a' : '#dc2626'} />
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
            Политика конфиденциальности · {identity.siteName}
          </h1>
        </div>

        {ok ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#15803d' }}>
            <CheckCircle2 size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700 }}>Подпись портала действительна.</div>
              <div style={{ fontSize: '0.9rem', marginTop: 4, color: 'var(--muted)' }}>
                Документ выпущен {identity.host}.
                {hashMatchesCurrent ? ' Содержимое совпадает с актуальной версией на сайте.' : null}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#b91c1c' }}>
            <XCircle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700 }}>
                {hasParams ? 'Подпись не совпадает или параметры некорректны.' : 'Не хватает параметров проверки.'}
              </div>
              <div style={{ fontSize: '0.9rem', marginTop: 4, color: 'var(--muted)' }}>
                Скачайте документ заново со страницы политики или откройте ссылку проверки из файла.
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
          Актуальная политика:{' '}
          <Link href={policyUrl} style={{ color: 'var(--primary)', fontWeight: 600 }}>
            {policyUrl}
          </Link>
        </div>
      </div>
    </div>
  );
}
