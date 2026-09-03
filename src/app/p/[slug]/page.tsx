import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import CmsPage from '@/components/CmsPage';
import AboutPage from '@/components/AboutPage';
import AboutTeamAuth from '@/components/AboutTeamAuth';
import { Metadata } from 'next';
import { publishedWhere } from '@/lib/publish';
import { staticCmsPageParams } from '@/lib/generate-public-static-params';

export const revalidate = 60;
export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  return staticCmsPageParams();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const resolved = await params;
  const { withSiteBrand, getSiteIdentity } = await import('@/lib/site-identity');
  const { siteName } = await getSiteIdentity();
  if (resolved.slug === 'privacy') {
    return { title: withSiteBrand('Политика конфиденциальности', siteName) };
  }
  const page = await prisma.pageContent.findFirst({
    where: { slug: resolved.slug, ...publishedWhere() },
  });

  if (!page) {
    return { title: 'Страница не найдена' };
  }

  return {
    title: withSiteBrand(page.title, siteName),
  };
}

export default async function DynamicPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolved = await params;
  if (resolved.slug === 'privacy') {
    redirect('/privacy');
  }
  if (resolved.slug === 'rules') {
    redirect('/rules');
  }
  if (resolved.slug === 'contacts') {
    redirect('/contacts');
  }
  if (resolved.slug === 'documents') {
    redirect('/documents');
  }
  if (resolved.slug === 'grants') {
    redirect('/grants');
  }
  if (resolved.slug === 'dobro') {
    redirect('/dobro');
  }
  if (resolved.slug === 'self-gov') {
    redirect('/self-gov');
  }
  const page = await prisma.pageContent.findFirst({
    where: { slug: resolved.slug, ...publishedWhere() },
  });

  if (!page) {
    notFound();
  }

  const { getSiteIdentity } = await import('@/lib/site-identity');
  const id = await getSiteIdentity();

  if (resolved.slug === 'about') {
    return (
      <AboutPage
        page={page}
        siteName={id.siteName}
        publicOrigin={id.publicOrigin}
        members={[]}
        teamSlot={<AboutTeamAuth />}
      />
    );
  }

  return <CmsPage page={page} siteName={id.siteName} publicOrigin={id.publicOrigin} />;
}
