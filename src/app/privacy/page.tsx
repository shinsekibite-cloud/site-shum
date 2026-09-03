import { Shield, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import PrivacyDownloadButton from '@/components/PrivacyDownloadButton';
import LegalDocShell, { prepareLegalHtml } from '@/components/LegalDocShell';
import { ensureSystemPages } from '@/lib/system-pages';
import { getPrivacyCmsContent } from '@/lib/privacy-document';
import { publishedWhere } from '@/lib/publish';
import { prisma } from '@/lib/prisma';
import { applySitePlaceholders, getSiteIdentity } from '@/lib/site-identity';
import { brandedMetadata } from '@/lib/branded-metadata';
import { withPrivacyDynamicHtml } from '@/lib/legal-live';
import { isNextBuildPhase } from '@/lib/build-phase';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata() {
  const { siteName } = await getSiteIdentity();
  return brandedMetadata('Политика конфиденциальности', {
    description: `Как портал «${siteName}» собирает, использует и защищает персональные данные.`,
    canonicalPath: '/privacy',
  });
}

export default async function PrivacyPolicy() {
  await ensureSystemPages();
  const identity = await getSiteIdentity();
  const cms = await getPrivacyCmsContent();
  const page = isNextBuildPhase()
    ? null
    : await prisma.pageContent.findFirst({
        where: { slug: 'privacy', ...publishedWhere() },
      }).catch(() => null);

  const title = page?.title || cms.title;
  const rawHtml = applySitePlaceholders(page?.content || '', identity);
  const liveHtml = await withPrivacyDynamicHtml(rawHtml);
  const { html, toc } = prepareLegalHtml(liveHtml);
  const versionLabel = cms.version;

  return (
    <LegalDocShell
      brand={identity.siteName}
      icon={<Shield size={26} strokeWidth={2.2} />}
      title={title}
      lead={
        <>
          Как оператор обрабатывает персональные данные на портале.
          Коротко, по делу и с возможностью скачать подписанный документ.
        </>
      }
      meta={
        <>
          <span className="legal-pill">
            <CalendarDays size={13} /> Версия от {versionLabel}
          </span>
          <span className="legal-pill">Подпись портала</span>
        </>
      }
      toc={toc}
      aside={
        <>
          <h2 className="legal-aside-title">Скачать и проверить</h2>
          <p className="legal-aside-text">
            HTML открывается корректно на телефоне. В файле — электронная подпись: если текст подменят, проверка на
            сайте это покажет.
          </p>
          <PrivacyDownloadButton dark />
          <Link
            href="/contacts"
            className="btn btn-secondary"
            style={{ width: '100%', maxWidth: 420, marginTop: '0.65rem', justifyContent: 'center' }}
          >
            Вопросы — в контакты
          </Link>
        </>
      }
    >
      {html ? (
        <div className="legal-prose" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="legal-prose" style={{ whiteSpace: 'pre-wrap' }}>
          {applySitePlaceholders(cms.body, identity)}
        </div>
      )}
    </LegalDocShell>
  );
}
