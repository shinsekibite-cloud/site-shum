import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import CookieSettingsLink from '@/components/CookieSettingsLink';
import FooterEcoStatus from '@/components/FooterEcoStatus';
import { publishedWhere } from '@/lib/publish';
import { parseModuleFlagsJson } from '@/lib/module-flags';
import { DEFAULT_SITE_NAME } from '@/lib/site-identity-shared';
import { APP_VERSION } from '@/lib/app-version';
import { isNextBuildPhase } from '@/lib/build-phase';

type NavItem = {
  href: string;
  label: string;
  group: 'discover' | 'participate' | 'info';
  module?: string;
};

const PRIMARY_NAV: NavItem[] = [
  { href: '/p/about', label: 'О нас', group: 'discover' },
  { href: '/spaces', label: 'Пространства', group: 'discover', module: 'spaces' },
  { href: '/places', label: 'Куда сходить', group: 'discover', module: 'places' },
  { href: '/events', label: 'Афиша', group: 'discover', module: 'events' },
  { href: '/gallery', label: 'Галерея', group: 'discover', module: 'gallery' },
  { href: '/projects', label: 'Проекты', group: 'participate', module: 'projects' },
  { href: '/clubs', label: 'Клубы', group: 'participate', module: 'clubs' },
  { href: '/friends', label: 'Друзья', group: 'participate', module: 'friends' },
  { href: '/vacancies', label: 'Вакансии', group: 'participate', module: 'vacancies' },
  { href: '/contests', label: 'Конкурсы', group: 'participate', module: 'contests' },
  { href: '/grants', label: 'Гранты', group: 'participate', module: 'grants' },
  { href: '/dobro', label: 'Добро', group: 'participate', module: 'dobro' },
  { href: '/self-gov', label: 'Самоуправление', group: 'info', module: 'self_gov' },
  { href: '/news', label: 'Новости', group: 'info', module: 'news' },
  { href: '/documents', label: 'Документы', group: 'info', module: 'documents' },
  { href: '/games', label: 'Игры', group: 'info', module: 'games' },
];

const FOOTER_GROUPS: { id: 'discover' | 'participate' | 'info'; title: string }[] = [
  { id: 'discover', title: 'Смотреть' },
  { id: 'participate', title: 'Участвовать' },
  { id: 'info', title: 'Информация' },
];

function flagsOn(moduleFlagsJson: string | null | undefined, key?: string) {
  if (!key) return true;
  const flags = parseModuleFlagsJson(moduleFlagsJson);
  return (flags as Record<string, boolean>)[key] !== false;
}

const getFooterData = unstable_cache(
  async () => {
    if (isNextBuildPhase()) {
      return { settings: null, footerPages: [] as { slug: string; title: string }[] };
    }
    const [settings, footerPages] = await Promise.all([
      prisma.siteSettings.findUnique({
        where: { id: '1' },
        select: {
          siteName: true,
          galleryPageEnabled: true,
          orgGalleryJson: true,
          moduleFlagsJson: true,
        },
      }),
      prisma.pageContent.findMany({
        where: { menuPosition: 'FOOTER', ...publishedWhere() },
        select: { slug: true, title: true },
        orderBy: { title: 'asc' },
      }),
    ]);
    return { settings, footerPages };
  },
  ['site-footer-v2'],
  { revalidate: 300, tags: ['yp-site-chrome'] }
);

export default async function Footer() {
  const { settings, footerPages } = await getFooterData();

  const reservedSlugs = new Set([
    'privacy',
    'about',
    'rules',
    'terms',
    'contacts',
    'documents',
    'news',
    'grants',
    'dobro',
    'self-gov',
    'games',
    'faq',
  ]);
  const primaryHrefs = new Set(PRIMARY_NAV.map((i) => i.href));
  const primaryLabels = new Set(PRIMARY_NAV.map((i) => i.label.toLowerCase()));
  const extraPages = footerPages.filter((p) => {
    if (reservedSlugs.has(p.slug)) return false;
    if (primaryHrefs.has(`/p/${p.slug}`) || primaryHrefs.has(`/${p.slug}`)) return false;
    if (primaryLabels.has(String(p.title || '').toLowerCase())) return false;
    return true;
  });

  const modOk = (key?: string) => flagsOn(settings?.moduleFlagsJson, key);

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer-grid site-footer-grid--compact">
          <nav className="site-footer-nav site-footer-nav--grouped" aria-label="Навигация в подвале">
            {FOOTER_GROUPS.map((group) => {
              const items = PRIMARY_NAV.filter((item) => {
                if (item.group !== group.id) return false;
                if (!modOk(item.module)) return false;
                if (item.href !== '/gallery') return true;
                const pageOn = settings?.galleryPageEnabled !== false;
                const hasPhotos = Boolean(String(settings?.orgGalleryJson || '').trim());
                return pageOn && hasPhotos;
              });
              if (!items.length && !(group.id === 'info' && extraPages.length)) return null;
              return (
                <div key={group.id} className="site-footer-nav-col">
                  <h3 className="site-footer-heading">{group.title}</h3>
                  <ul className="site-footer-nav-list">
                    {items.map((item) => (
                      <li key={item.href}>
                        <Link href={item.href}>{item.label}</Link>
                      </li>
                    ))}
                    {group.id === 'info' &&
                      extraPages.map((p) => (
                        <li key={p.slug}>
                          <Link href={`/p/${p.slug}`}>{p.title}</Link>
                        </li>
                      ))}
                    {group.id === 'info' ? (
                      <>
                        <li>
                          <Link href="/contacts">Контакты и соцсети</Link>
                        </li>
                        {modOk('faq') ? (
                          <li>
                            <Link href="/faq">Вопросы и ответы</Link>
                          </li>
                        ) : null}
                      </>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </nav>
        </div>

        <FooterEcoStatus />

        <div className="site-footer-legal">
          <p className="site-footer-legal-copy">
            &copy; {new Date().getFullYear()} {settings?.siteName || DEFAULT_SITE_NAME}
          </p>
          <nav className="site-footer-legal-links" aria-label="Правовая информация">
            <Link href="/privacy">152-ФЗ / cookie</Link>
            <span className="site-footer-legal-sep" aria-hidden>
              ·
            </span>
            <CookieSettingsLink />
            <span className="site-footer-legal-sep" aria-hidden>
              ·
            </span>
            <Link href="/rules">Правила</Link>
            <span className="site-footer-legal-sep" aria-hidden>
              ·
            </span>
            <Link href="/terms">Соглашение</Link>
          </nav>
          <p className="site-footer-version" title={`YoungPortal ${APP_VERSION}`}>
            версия {APP_VERSION}
          </p>
        </div>
      </div>
    </footer>
  );
}
