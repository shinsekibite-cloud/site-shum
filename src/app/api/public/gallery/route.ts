import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { canViewPortalGallery, getGallerySettings } from '@/lib/gallery';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [session, settings] = await Promise.all([getServerSession(authOptions), getGallerySettings()]);
  const allowed = canViewPortalGallery({
    pageEnabled: true,
    homepageEnabled: true,
    publicEnabled: settings.publicEnabled,
    isAuthenticated: Boolean(session?.user),
    surface: 'page',
  });
  if (!allowed && !canViewPortalGallery({
    pageEnabled: settings.pageEnabled,
    homepageEnabled: settings.homepageEnabled,
    publicEnabled: settings.publicEnabled,
    isAuthenticated: Boolean(session?.user),
    surface: 'home',
  })) {
    return NextResponse.json({ message: 'Галерея доступна после входа' }, { status: 401 });
  }
  return NextResponse.json({
    orgGalleryJson: settings.orgGalleryJson,
    items: settings.orgGalleryItems,
    pageEnabled: settings.pageEnabled,
    homepageEnabled: settings.homepageEnabled,
    publicEnabled: settings.publicEnabled,
  });
}
