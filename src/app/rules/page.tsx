import { ScrollText } from 'lucide-react';
import LegalDocShell, { prepareLegalHtml } from '@/components/LegalDocShell';
import { ensureSystemPages } from '@/lib/system-pages';
import { prisma } from '@/lib/prisma';
import { publishedWhere } from '@/lib/publish';
import { applySitePlaceholders, getSiteIdentity } from '@/lib/site-identity';
import { brandedMetadata } from '@/lib/branded-metadata';
import { withRulesDynamicHtml } from '@/lib/legal-live';
import { isNextBuildPhase } from '@/lib/build-phase';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata() {
  const { siteName } = await getSiteIdentity();
  return brandedMetadata('Правила сайта', {
    description: `Правила пользования порталом ${siteName}`,
    canonicalPath: '/rules',
  });
}

export default async function RulesPage() {
  await ensureSystemPages();
  const identity = await getSiteIdentity();
  const page = isNextBuildPhase()
    ? null
    : await prisma.pageContent.findFirst({
        where: { slug: 'rules', ...publishedWhere() },
      }).catch(() => null);

  const title = page?.title || 'Правила сайта';
  const raw = applySitePlaceholders(page?.content || '<p>Правила скоро появятся.</p>', identity);
  const live = await withRulesDynamicHtml(raw);
  const { html, toc } = prepareLegalHtml(live);

  return (
    <LegalDocShell
      brand={identity.siteName}
      icon={<ScrollText size={26} strokeWidth={2.2} />}
      title={title}
      lead={
        <>
          Обязательные правила пользования порталом. Нарушение может привести к ограничению доступа.
        </>
      }
      toc={toc}
    >
      <div className="legal-prose" dangerouslySetInnerHTML={{ __html: html }} />
    </LegalDocShell>
  );
}
