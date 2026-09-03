import { FileText } from 'lucide-react';
import LegalDocShell, { prepareLegalHtml } from '@/components/LegalDocShell';
import { ensureSystemPages } from '@/lib/system-pages';
import { prisma } from '@/lib/prisma';
import { publishedWhere } from '@/lib/publish';
import { applySitePlaceholders, getSiteIdentity } from '@/lib/site-identity';
import { brandedMetadata } from '@/lib/branded-metadata';
import { withTermsDynamicHtml } from '@/lib/legal-live';
import { TERMS_POLICY_VERSION } from '@/lib/consent-versions';
import { isNextBuildPhase } from '@/lib/build-phase';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata() {
  const { siteName } = await getSiteIdentity();
  return brandedMetadata('Пользовательское соглашение', {
    description: `Условия использования портала ${siteName}`,
    canonicalPath: '/terms',
  });
}

export default async function TermsPage() {
  await ensureSystemPages();
  const identity = await getSiteIdentity();
  const page = isNextBuildPhase()
    ? null
    : await prisma.pageContent.findFirst({
        where: { slug: 'terms', ...publishedWhere() },
      }).catch(() => null);

  const title = page?.title || 'Пользовательское соглашение';
  const raw = applySitePlaceholders(
    page?.content || '<p>Соглашение скоро появится.</p>',
    identity
  );
  const live = await withTermsDynamicHtml(raw);
  const { html, toc } = prepareLegalHtml(live);

  return (
    <LegalDocShell
      brand={identity.siteName}
      icon={<FileText size={26} strokeWidth={2.2} />}
      title={title}
      lead={
        <>
          Условия безвозмездного использования портала. Не является коммерческой офертой.
        </>
      }
      meta={
        <span className="legal-pill">Версия {TERMS_POLICY_VERSION}</span>
      }
      toc={toc}
    >
      <div className="legal-prose" dangerouslySetInnerHTML={{ __html: html }} />
    </LegalDocShell>
  );
}
