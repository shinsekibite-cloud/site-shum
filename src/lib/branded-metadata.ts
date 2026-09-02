import type { Metadata } from 'next';
import { getSiteIdentity, withSiteBrand } from '@/lib/site-identity';

/** Dynamic page metadata branded with current SiteSettings.siteName. */
export async function brandedMetadata(
  pageTitle: string,
  extras?: Omit<Metadata, 'title'> & { titleAbsolute?: boolean; canonicalPath?: string }
): Promise<Metadata> {
  const { siteName, publicOrigin } = await getSiteIdentity();
  const { titleAbsolute, canonicalPath, ...rest } = extras || {};
  const clean = withSiteBrand(pageTitle, siteName);
  const ogUrl =
    typeof rest.openGraph === 'object' && rest.openGraph && 'url' in rest.openGraph
      ? String((rest.openGraph as { url?: string }).url || '')
      : '';
  const canonical =
    (typeof rest.alternates?.canonical === 'string' && rest.alternates.canonical) ||
    ogUrl ||
    (canonicalPath
      ? `${publicOrigin}${canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`}`
      : undefined);
  return {
    ...rest,
    // absolute: full "Page | Brand"; default: fragment for layout title.template
    title: titleAbsolute ? { absolute: `${clean} | ${siteName}` } : clean,
    metadataBase: rest.metadataBase || new URL(publicOrigin),
    alternates: {
      ...(canonical ? { canonical } : {}),
      ...(rest.alternates || {}),
    },
  };
}
