import { Metadata } from 'next';
import Link from 'next/link';
import FaqHub from '@/components/FaqHub';
import { FAQ_CATEGORIES, filterFaqCategories, type FaqCategory } from '@/lib/faq-content';
import { getModuleFlags } from '@/lib/module-flags';
import { getPublishedFaqCategories } from '@/lib/faq-db';
import { isNextBuildPhase } from '@/lib/build-phase';

export const revalidate = 60;
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const { withSiteBrand, getSiteIdentity } = await import('@/lib/site-identity');
  const { siteName, publicOrigin } = await getSiteIdentity();
  return {
    title: withSiteBrand('Вопросы и ответы', siteName),
    description: 'Ответы на частые вопросы о портале, записи и личном кабинете.',
    alternates: { canonical: `${publicOrigin}/faq` },
  };
}

export default async function FaqPage() {
  const modules = await getModuleFlags();
  let categories: FaqCategory[] = [];

  if (!isNextBuildPhase()) {
    try {
      categories = await getPublishedFaqCategories();
    } catch {
      categories = [];
    }
  }

  if (!categories.length) {
    categories = filterFaqCategories(FAQ_CATEGORIES, modules);
  }

  return (
    <div className="cms-page-shell faq-page" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <header className="faq-page__header">
        <h1 className="page-hero-title faq-page__title">Вопросы и ответы</h1>
        <p className="faq-page__lead">
          Как пользоваться кабинетом, событиями, сообщениями, мбаллами и другими разделами портала.
          Есть поиск и фильтр по категориям.
        </p>
        <p className="faq-page__contacts">
          <Link href="/contacts">Не нашли ответ — напишите в контакты</Link>
        </p>
      </header>

      <FaqHub categories={categories} />
    </div>
  );
}
