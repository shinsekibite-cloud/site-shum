import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import Navbar from './Navbar';
import { publishedWhere } from '@/lib/publish';
import { pickNavCatalog } from '@/lib/nav-catalog';
import { isNextBuildPhase } from '@/lib/build-phase';

const getNavbarData = unstable_cache(
  async () => {
    if (isNextBuildPhase()) {
      return {
        spaces: [] as { id: string; title: string }[],
        clubs: [] as { id: string; title: string }[],
        projects: [] as { id: string; title: string }[],
        pages: [] as { id: string; slug: string; title: string; menuPosition: string }[],
        siteSettings: null,
      };
    }
    const [spacesRaw, clubsRaw, projectsRaw, pages, siteSettings] = await Promise.all([
      prisma.space.findMany({
        where: { status: { not: 'INACTIVE' }, isDemoData: false },
        select: { id: true, title: true },
        orderBy: { updatedAt: 'desc' },
        take: 24,
      }),
      prisma.club.findMany({
        where: { status: { not: 'INACTIVE' }, isDemoData: false },
        select: { id: true, title: true },
        orderBy: { updatedAt: 'desc' },
        take: 24,
      }),
      prisma.project.findMany({
        where: { status: { not: 'INACTIVE' }, isDemoData: false },
        select: { id: true, title: true },
        orderBy: { updatedAt: 'desc' },
        take: 24,
      }),
      prisma.pageContent.findMany({
        where: { menuPosition: { in: ['HEADER_MAIN', 'HEADER_SUB'] }, ...publishedWhere() },
        select: { id: true, slug: true, title: true, menuPosition: true },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.siteSettings.findUnique({
        where: { id: '1' },
        select: {
          siteName: true,
          logoUrl: true,
          contactEmail: true,
          contactPhone: true,
          address: true,
          vkLink: true,
          vkEnabled: true,
          tgLink: true,
          tgEnabled: true,
          okLink: true,
          okEnabled: true,
          whatsappLink: true,
          whatsappEnabled: true,
          rutubeLink: true,
          rutubeEnabled: true,
          maxLink: true,
          maxEnabled: true,
          publicEventsVisibility: true,
          galleryPageEnabled: true,
          moduleFlagsJson: true,
        },
      }),
    ]);

    return {
      spaces: pickNavCatalog(spacesRaw, 6),
      clubs: pickNavCatalog(clubsRaw, 6),
      projects: pickNavCatalog(projectsRaw, 6),
      pages,
      siteSettings,
    };
  },
  ['navbar-dropdown-data-v2'],
  { revalidate: 300, tags: ['yp-site-chrome'] }
);

export default async function NavbarWrapper() {
  const { spaces, clubs, projects, pages, siteSettings } = await getNavbarData();

  return (
    <Navbar
      spaces={spaces}
      clubs={clubs}
      projects={projects}
      pages={pages}
      siteSettings={siteSettings}
    />
  );
}
