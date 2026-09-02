'use client';

function modOn(settings: any, key: string) {
  try {
    const raw = settings?.moduleFlagsJson;
    if (!raw) return true;
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!o || typeof o !== 'object') return true;
    if (typeof o[key] === 'boolean') return o[key] !== false;
    // Legacy umbrella `programs` → grants / dobro / self_gov
    if (
      (key === 'grants' || key === 'dobro' || key === 'self_gov') &&
      typeof o.programs === 'boolean'
    ) {
      return o.programs !== false;
    }
  } catch {
    /* ignore */
  }
  return true;
}


import Link from 'next/link';
import {
  User,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Search,
  LogOut,
  Ticket,
  LayoutDashboard,
  UserCircle,
  Settings,
  Users,
  Award,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  Gamepad2,
  HandHeart,
  Image as ImageIcon,
  Landmark,
  MapPin,
  Newspaper,
  Sparkles,
  Phone,
  Home,
  Shield,
  MessageCircle,
  BookOpen,
  ShoppingBag,
  Zap,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import GuestAuthPrompt from '@/components/GuestAuthPrompt';
import SiteBrand from '@/components/SiteBrand';
import NavProfileCard from '@/components/NavProfileCard';
import NotificationsBell from '@/components/NotificationsBell';
import { publicPagePath } from '@/lib/public-paths';
import { signOutLogged } from '@/lib/sign-out-logged';
import { encodeRouteParam } from '@/lib/route-id';
import { isPrimaryHeaderSlug } from '@/lib/nav-catalog';
import { fetchProfileCached } from '@/lib/user-data-client';
import { requestOpenQuickAccess } from '@/lib/quick-access';

type OpenMenu = 'projects' | 'clubs' | 'spaces' | 'more' | 'account' | null;

export default function Navbar({ spaces = [], clubs = [], projects = [], pages = [], siteSettings }: any) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [overflowIds, setOverflowIds] = useState<string[]>([]);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const navRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const moreId = useId();

  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const isScanner = userRole === 'SCANNER';
  const isTech = userRole === 'TECH';
  const isStaff = userRole === 'ADMIN' || userRole === 'MODERATOR';
  const [publicCode, setPublicCode] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id || isScanner) {
      setPublicCode(null);
      return;
    }
    let cancelled = false;
    fetchProfileCached()
      .then((data) => {
        if (cancelled) return;
        const code = typeof data?.publicCode === 'string' ? data.publicCode.trim() : '';
        setPublicCode(code || null);
      })
      .catch(() => {
        if (!cancelled) setPublicCode(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, isScanner]);

  const dashboardHref = isTech ? '/ops' : isScanner ? '/scanner' : '/dashboard';
  /** Единая точка входа в профиль/кабинет (публичный вид — из кабинета). */
  const profileHref = dashboardHref;

  const isActive = (path: string) => {
    if (path === '/' && pathname !== '/') return false;
    return pathname?.startsWith(path);
  };

  const getLinkStyle = (path: string, baseStyle: any = { fontWeight: 500 }) => ({
    ...baseStyle,
    color: isActive(path) ? 'var(--primary)' : 'inherit',
    fontWeight: isActive(path) ? 700 : baseStyle.fontWeight,
  });

  const toggleMenu = () => setIsMobileMenuOpen((open) => !open);
  const closeMenu = () => setIsMobileMenuOpen(false);
  const closeDesktopMenus = () => setOpenMenu(null);
  const openQuickPanel = () => {
    closeMenu();
    closeDesktopMenus();
    requestOpenQuickAccess();
  };

  useEffect(() => {
    closeMenu();
    closeDesktopMenus();
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!searchOpen) return;
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [searchOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    document.body.classList.add('mobile-nav-open');
    document.documentElement.classList.add('mobile-nav-open');

    const root = mobileMenuRef.current;
    const focusableSel =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusables = () => {
      const fromMenu = root
        ? (Array.from(root.querySelectorAll(focusableSel)) as HTMLElement[]).filter(
            (el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0
          )
        : [];
      const btn = menuButtonRef.current;
      if (btn && !fromMenu.includes(btn)) return [btn, ...fromMenu];
      return fromMenu;
    };

    window.requestAnimationFrame(() => {
      const items = getFocusables();
      (items[0] || menuButtonRef.current)?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const items = getFocusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || (active && !root.contains(active))) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('mobile-nav-open');
      document.documentElement.classList.remove('mobile-nav-open');
      window.removeEventListener('keydown', onKey);
      menuButtonRef.current?.focus();
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!openMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDesktopMenus();
      }
    };
    const onPointer = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (navRef.current?.contains(el)) return;
      if (el?.closest?.('.nav-account')) return;
      closeDesktopMenus();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [openMenu]);

  const headerMainPages = pages.filter((p: any) => p.menuPosition === 'HEADER_MAIN');
  const headerSubPages = pages.filter(
    (p: any) =>
      p.menuPosition === 'HEADER_SUB' &&
      !isPrimaryHeaderSlug(String(p.slug || ''), String(p.title || ''))
  );
  const settingsHref = '/dashboard/settings';
  const cabinetLabel = isTech ? 'Ops' : isScanner ? 'Сканер' : 'Профиль';
  const cabinetHint = isTech ? 'Техпанель' : isScanner ? 'Сканирование QR' : 'Обзор и разделы';
  const settingsHint = 'Приватность и безопасность';

  const catalogTrigger = (
    id: 'projects' | 'clubs' | 'spaces',
    href: string,
    label: string,
    count: number
  ) => {
    const style = {
      ...getLinkStyle(href),
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      background: 'transparent',
      border: 0,
      padding: 0,
      font: 'inherit',
      cursor: 'pointer',
    } as const;
    if (count <= 0) {
      return (
        <Link href={href} data-nav-trigger={id} style={style}>
          {label}
        </Link>
      );
    }
    return (
      <button
        type="button"
        data-nav-trigger={id}
        style={style}
        aria-expanded={openMenu === id}
        aria-haspopup="menu"
        onClick={() => setOpenMenu(id)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpenMenu(id);
          }
        }}
      >
        {label} <ChevronDown size={14} />
      </button>
    );
  };

  const renderDropdown = (
    id: Exclude<OpenMenu, null>,
    trigger: ReactNode,
    items: ReactNode,
    hasItems: boolean
  ) => (
    <div
      className={`nav-item${openMenu === id ? ' is-open' : ''}`}
      data-nav-id={id === 'more' ? undefined : id}
      onMouseEnter={() => {
        if (hasItems) setOpenMenu(id);
      }}
      onFocusCapture={() => {
        if (hasItems) setOpenMenu(id);
      }}
    >
      {trigger}
      {hasItems && (
        <div className="dropdown" role="menu">
          {items}
        </div>
      )}
    </div>
  );

  const renderSearch = (variant: 'desktop' | 'mobile') => (
    <div className={`nav-search nav-search--${variant}${searchOpen ? ' is-open' : ''}`}>
      {searchOpen ? (
        <form action="/search" method="GET" className="nav-search-form">
          <Search size={16} className="nav-search-icon" aria-hidden />
          <input
            ref={searchInputRef}
            id={variant === 'desktop' ? 'site-search-input' : undefined}
            type="search"
            name="q"
            placeholder="Поиск… (/)"
            className="nav-search-input"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setSearchOpen(false);
              }
            }}
          />
          <button
            type="button"
            className="nav-icon-btn nav-search-close"
            aria-label="Закрыть поиск"
            onClick={() => setSearchOpen(false)}
          >
            <X size={16} />
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="nav-icon-btn nav-search-trigger"
          aria-label={variant === 'desktop' ? 'Поиск по сайту' : 'Поиск'}
          title="Поиск (/)"
          onClick={() => setSearchOpen(true)}
        >
          <Search size={18} />
        </button>
      )}
    </div>
  );

  // Guest links must stay visible during session resolve — never leave empty ghost placeholders.
  // Authenticated chrome only after status === 'authenticated'.
  const isAuthenticated = status === 'authenticated' && Boolean(session);
  const authIconCount = isAuthenticated ? (isScanner ? 2 : 2) : 0;

  const renderAuthIcons = () => (
    <div
      className="nav-auth-slot"
      style={{ ['--nav-auth-slots' as string]: authIconCount }}
    >
      {!isAuthenticated ? (
        <div className="nav-auth-icons nav-auth-guest">
          <GuestAuthPrompt
            href="/coworking"
            className="nav-pill nav-pill--solid nav-pill--desktop-cta"
            title="Записаться"
            asButton
          >
            Запись
          </GuestAuthPrompt>
          <Link href="/login" className="nav-pill nav-pill--ghost" title="Вход">
            Вход
          </Link>
          {modOn(siteSettings, 'registration') ? (
            <Link href="/register" className="nav-pill nav-pill--solid" title="Регистрация">
              Регистрация
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="nav-auth-icons nav-auth-icons--compact">
          {modOn(siteSettings, 'notifications') ? <NotificationsBell compact useNavStyle /> : null}
          <div className={`nav-item nav-account${openMenu === 'account' ? ' is-open' : ''}`}>
            <button
              type="button"
              className="nav-icon-btn nav-account-trigger"
              aria-expanded={openMenu === 'account'}
              aria-haspopup="menu"
              title="Аккаунт"
              aria-label="Аккаунт"
              onClick={() => setOpenMenu((m) => (m === 'account' ? null : 'account'))}
            >
              <UserCircle size={18} />
              <ChevronDown size={12} className="nav-account-chevron" aria-hidden />
            </button>
            {openMenu === 'account' && (
              <div className="dropdown nav-account-menu" role="menu">
                <div className="nav-account-menu__head">
                  <strong>
                    {(session.user as { nickname?: string | null })?.nickname ||
                      session.user?.name ||
                      'Аккаунт'}
                  </strong>
                  <span>{session.user?.email}</span>
                </div>
                <Link href={profileHref} className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                  <UserCircle size={16} aria-hidden />
                  <span className="nav-account-menu__label">
                    <strong>Профиль</strong>
                    <small>Обзор и разделы</small>
                  </span>
                </Link>
                <button
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    closeDesktopMenus();
                    openQuickPanel();
                  }}
                >
                  <Zap size={16} aria-hidden />
                  <span className="nav-account-menu__label">
                    <strong>Быстрый доступ</strong>
                    <small>Панель справа</small>
                  </span>
                </button>
                {!isScanner && !isTech ? (
                  <Link href="/dashboard/guides" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                    <BookOpen size={16} aria-hidden />
                    <span className="nav-account-menu__label">
                      <strong>Инструктажи</strong>
                      <small>Как пользоваться порталом</small>
                    </span>
                  </Link>
                ) : null}
                {!isScanner && !isTech && modOn(siteSettings, 'achievements') ? (
                  <Link href="/dashboard/achievements" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                    <Award size={16} aria-hidden />
                    <span className="nav-account-menu__label">
                      <strong>Достижения</strong>
                      <small>Значки и прогресс</small>
                    </span>
                  </Link>
                ) : null}
                {!isScanner && !isTech && modOn(siteSettings, 'eco') ? (
                  <Link href="/dashboard/shop" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                    <ShoppingBag size={16} aria-hidden />
                    <span className="nav-account-menu__label">
                      <strong>Магазин</strong>
                      <small>Рамки, темы и мбаллы</small>
                    </span>
                  </Link>
                ) : null}
                {!isScanner && !isTech && modOn(siteSettings, 'friends') ? (
                  <Link href="/friends" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                    <Users size={16} aria-hidden />
                    <span className="nav-account-menu__label">
                      <strong>Друзья</strong>
                      <small>Заявки и список</small>
                    </span>
                  </Link>
                ) : null}
                {!isScanner && !isTech && modOn(siteSettings, 'messaging') ? (
                  <Link href="/messages" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                    <MessageCircle size={16} aria-hidden />
                    <span className="nav-account-menu__label">
                      <strong>Сообщения</strong>
                      <small>Личная переписка</small>
                    </span>
                  </Link>
                ) : null}
                {!isScanner ? (
                  <Link href="/tickets" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                    <Ticket size={16} aria-hidden />
                    <span className="nav-account-menu__label">
                      <strong>Билеты</strong>
                      <small>QR и записи</small>
                    </span>
                  </Link>
                ) : null}
                {!isScanner && !isTech ? (
                  <Link href={settingsHref} className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                    <Settings size={16} aria-hidden />
                    <span className="nav-account-menu__label">
                      <strong>Настройки аккаунта</strong>
                      <small>{settingsHint}</small>
                    </span>
                  </Link>
                ) : null}
                {isStaff ? (
                  <Link href="/admin" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                    <Shield size={16} aria-hidden />
                    <span className="nav-account-menu__label">
                      <strong>Панель</strong>
                      <small>Администрирование</small>
                    </span>
                  </Link>
                ) : null}
                {isTech || isScanner ? (
                  <Link href={dashboardHref} className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                    <LayoutDashboard size={16} aria-hidden />
                    <span className="nav-account-menu__label">
                      <strong>{cabinetLabel}</strong>
                      <small>{cabinetHint}</small>
                    </span>
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="dropdown-item nav-account-menu__logout"
                  role="menuitem"
                  onClick={() => {
                    closeDesktopMenus();
                    void signOutLogged({ callbackUrl: '/' });
                  }}
                >
                  <LogOut size={16} aria-hidden /> Выйти
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );


  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const nodes = Array.from(nav.querySelectorAll<HTMLElement>('[data-nav-id]'));
      nodes.forEach((n) => n.removeAttribute('data-nav-overflow'));
      const more = nav.querySelector<HTMLElement>('[data-nav-id="more"]');
      if (more) more.removeAttribute('data-nav-overflow');
      let used = 0;
      const gap = 14;
      const reserveMore = 72;
      const budget = Math.max(120, nav.clientWidth - reserveMore);
      const hidden: string[] = [];
      const keepVisible = new Set(['projects', 'clubs', 'spaces', 'events', 'news']);
      for (const node of nodes) {
        const id = node.dataset.navId || '';
        if (!id || id === 'more') continue;
        if (keepVisible.has(id)) {
          used += (node.getBoundingClientRect().width || 0) + gap;
          continue;
        }
        const w = node.getBoundingClientRect().width || 0;
        if (used + w + gap > budget) {
          node.setAttribute('data-nav-overflow', '1');
          hidden.push(id);
        } else {
          used += w + gap;
        }
      }
      setOverflowIds(hidden);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    ro?.observe(nav);
    measure();
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [headerMainPages.length, projects.length, clubs.length, spaces.length]);


  /** Mobile: CTA + burger only — search lives inside the menu (no header crush). */
  const renderMobileHeaderActions = () => {
    if (!isAuthenticated) {
      return (
        <div className="nav-auth-mobile__row nav-auth-mobile__row--guest">
          <GuestAuthPrompt
            href="/coworking"
            className="nav-pill nav-pill--solid nav-pill--mobile-cta"
            title="Записаться"
            asButton
          >
            Запись
          </GuestAuthPrompt>
        </div>
      );
    }
    return (
      <div className="nav-auth-mobile__row nav-auth-mobile__row--session">
        <GuestAuthPrompt
          href="/coworking"
          className="nav-pill nav-pill--solid nav-pill--mobile-cta"
          title="Записаться"
        >
          Запись
        </GuestAuthPrompt>
        <Link
          href={profileHref}
          className={`nav-icon-btn nav-auth-mobile__profile${isActive(profileHref) ? ' is-active' : ''}`}
          aria-label="Профиль"
          title="Профиль"
          aria-current={isActive(profileHref) ? 'page' : undefined}
        >
          <UserCircle size={18} aria-hidden />
        </Link>
      </div>
    );
  };


  return (
    <header className={`glass-nav${isMobileMenuOpen ? ' menu-open' : ''}${searchOpen ? ' search-open' : ''}`}>
      <div className="container glass-nav-inner">
        <SiteBrand
          siteName={siteSettings?.siteName}
          logoUrl={siteSettings?.logoUrl}
          size="header"
          className="site-brand-nav"
        />

        <nav
          ref={navRef}
          style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'nowrap' }}
          className="desktop-nav"
          aria-label="Основное меню"
        >
          {headerMainPages
            .filter((page: any) => {
              const slug = String(page.slug || '').toLowerCase();
              // TZ: 4–6 primary links — keep About in the main row only
              return slug === 'about' || slug === 'o-nas' || page.title === 'О нас';
            })
            .map((page: any) => (
            <Link key={page.id} href={publicPagePath(page.slug)} data-nav-id={`page-${page.slug}`} style={getLinkStyle(publicPagePath(page.slug))}>
              {page.title}
            </Link>
          ))}

          {modOn(siteSettings, 'projects')
            ? renderDropdown(
                'projects',
                catalogTrigger('projects', '/projects', 'Проекты', projects.length),
                <>
                  {projects.map((p: any) => (
                    <Link
                      key={p.id}
                      href={`/projects/${encodeRouteParam(p.id)}`}
                      className="dropdown-item"
                      role="menuitem"
                      onClick={closeDesktopMenus}
                    >
                      {p.title}
                    </Link>
                  ))}
                  <Link
                    href="/projects"
                    className="dropdown-item"
                    role="menuitem"
                    onClick={closeDesktopMenus}
                    style={{ borderTop: '1px solid #eee', fontWeight: 600, color: 'var(--primary)' }}
                  >
                    Все проекты &rarr;
                  </Link>
                </>,
                projects.length > 0
              )
            : null}

          {modOn(siteSettings, 'clubs')
            ? renderDropdown(
                'clubs',
                catalogTrigger('clubs', '/clubs', 'Клубы', clubs.length),
                <>
                  {clubs.map((c: any) => (
                    <Link
                      key={c.id}
                      href={`/clubs/${encodeRouteParam(c.id)}`}
                      className="dropdown-item"
                      role="menuitem"
                      onClick={closeDesktopMenus}
                    >
                      {c.title}
                    </Link>
                  ))}
                  <Link
                    href="/clubs"
                    className="dropdown-item"
                    role="menuitem"
                    onClick={closeDesktopMenus}
                    style={{ borderTop: '1px solid #eee', fontWeight: 600, color: 'var(--primary)' }}
                  >
                    Все клубы &rarr;
                  </Link>
                </>,
                clubs.length > 0
              )
            : null}

          {modOn(siteSettings, 'spaces')
            ? renderDropdown(
                'spaces',
                catalogTrigger('spaces', '/spaces', 'Пространства', spaces.length),
                <>
                  {spaces.map((s: any) => (
                    <Link
                      key={s.id}
                      href={`/spaces/${encodeRouteParam(s.id)}`}
                      className="dropdown-item"
                      role="menuitem"
                      onClick={closeDesktopMenus}
                    >
                      {s.title}
                    </Link>
                  ))}
                  <Link
                    href="/spaces"
                    className="dropdown-item"
                    role="menuitem"
                    onClick={closeDesktopMenus}
                    style={{ borderTop: '1px solid #eee', fontWeight: 600, color: 'var(--primary)' }}
                  >
                    Все пространства &rarr;
                  </Link>
                </>,
                spaces.length > 0
              )
            : null}

          {modOn(siteSettings, 'events') ? (
            <Link href="/events" data-nav-id="events" style={getLinkStyle('/events')}>
              Афиша
            </Link>
          ) : null}
          {modOn(siteSettings, 'news') ? (
            <Link href="/news" data-nav-id="news" style={getLinkStyle('/news')}>
              Новости
            </Link>
          ) : null}

          {renderDropdown(
              'more',
              <button
                type="button"
                id={moreId}
                className="nav-more-btn"
                data-nav-id="more"
                style={{
                  cursor: 'pointer',
                  fontWeight: openMenu === 'more' ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  color: 'inherit',
                }}
                aria-expanded={openMenu === 'more'}
                aria-haspopup="menu"
                aria-controls={`${moreId}-menu`}
                onClick={() => setOpenMenu((m) => (m === 'more' ? null : 'more'))}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setOpenMenu('more');
                  }
                }}
              >
                Ещё <ChevronDown size={14} />
              </button>,
              <>
                {(siteSettings?.galleryPageEnabled ?? true) && modOn(siteSettings, 'gallery') && (
                  <Link href="/gallery" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Галерея</Link>
                )}
                {modOn(siteSettings, 'places') && (
                  <Link href="/places" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Куда сходить</Link>
                )}
                {modOn(siteSettings, 'vacancies') && (
                  <Link href="/vacancies" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Вакансии</Link>
                )}
                {modOn(siteSettings, 'contests') && (
                  <Link href="/contests" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Конкурсы</Link>
                )}
                {headerMainPages
                  .filter((page: any) => {
                    const slug = String(page.slug || '').toLowerCase();
                    return !(slug === 'about' || slug === 'o-nas' || page.title === 'О нас');
                  })
                  .map((page: any) => (
                    <Link
                      key={`more-${page.id}`}
                      href={publicPagePath(page.slug)}
                      className="dropdown-item"
                      role="menuitem"
                      onClick={closeDesktopMenus}
                    >
                      {page.title}
                    </Link>
                  ))}
                {headerSubPages.length > 0 && (
                  <div className="dropdown-section-label" role="presentation">
                    Ещё на сайте
                  </div>
                )}
                {headerSubPages.map((page: any) => (
                  <Link
                    key={page.id}
                    href={publicPagePath(page.slug)}
                    className="dropdown-item"
                    role="menuitem"
                    onClick={closeDesktopMenus}
                  >
                    {page.title}
                  </Link>
                ))}
              </>,
              true
            )}
        </nav>

        <div className="glass-nav-end">
          <div className="nav-search-desktop" aria-hidden={false}>
            {renderSearch('desktop')}
          </div>
          <div className="nav-header-mobile nav-header-mobile--compact" aria-hidden>
            {/* Search moves into burger menu on narrow screens to avoid logo crush */}
          </div>
          <div
            className={`nav-auth-desktop${isAuthenticated ? ' nav-auth-desktop--session' : ' nav-auth-desktop--guest'}`}
          >
            {renderAuthIcons()}
          </div>
          <div className="nav-auth-mobile" aria-label="Быстрые действия">
            {renderMobileHeaderActions()}
          </div>
          <button
            ref={menuButtonRef}
            className="mobile-menu-btn"
            onClick={toggleMenu}
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          className="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Меню"
        >
          <nav className="mobile-menu__nav">
            <div className="mobile-menu__sheet-head">
              <h2 className="mobile-menu__sheet-title">Меню</h2>
              <div className="mobile-menu__sheet-tools">
                <button
                  type="button"
                  className="mobile-menu__icon-btn"
                  aria-label="Быстрый доступ"
                  title="Быстрый доступ"
                  onClick={openQuickPanel}
                >
                  <Zap size={20} />
                </button>
                {session && !isScanner && !isTech && (
                  <Link
                    href={settingsHref}
                    className="mobile-menu__icon-btn"
                    aria-label="Настройки аккаунта"
                    title="Настройки аккаунта"
                    onClick={closeMenu}
                  >
                    <Settings size={20} />
                  </Link>
                )}
                {session && !isScanner && !isTech && modOn(siteSettings, 'notifications') ? (
                  <NotificationsBell compact useNavStyle />
                ) : null}
                {session ? (
                  <button
                    type="button"
                    className="mobile-menu__icon-btn"
                    aria-label="Выйти"
                    title="Выйти"
                    onClick={() => {
                      closeMenu();
                      void signOutLogged({ callbackUrl: '/' });
                    }}
                  >
                    <LogOut size={20} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mobile-menu__auth">
              <form action="/search" method="GET" className="mobile-menu__search" onSubmit={closeMenu}>
                <Search size={16} aria-hidden />
                <input type="search" name="q" placeholder="Поиск по сайту…" aria-label="Поиск" />
              </form>
              {!isAuthenticated ? (
                <div className="mobile-menu__auth-guest">
                  <Link href="/login" onClick={closeMenu} className="mobile-menu__login btn btn-primary">
                    <User size={20} aria-hidden />
                    Вход
                  </Link>
                  {modOn(siteSettings, 'registration') ? (
                    <Link href="/register" onClick={closeMenu} className="mobile-menu__register btn btn-secondary">
                      Регистрация
                    </Link>
                  ) : null}
                </div>
              ) : (
                <NavProfileCard
                  variant="sheet"
                  href={profileHref}
                  fallbackName={
                    (session!.user as { nickname?: string | null })?.nickname || session!.user?.name
                  }
                  active={isMobileMenuOpen}
                  onNavigate={closeMenu}
                  ctaLabel={isTech ? 'Открыть Ops' : isScanner ? 'Открыть сканер' : 'Открыть профиль'}
                />
              )}
            </div>

            {session && !isScanner && !isTech && (
              <ul className="mobile-menu__list" aria-label="Профиль">
                <li>
                  <button type="button" className="mobile-menu__row" onClick={openQuickPanel}>
                    <Zap size={20} aria-hidden />
                    <span>Быстрый доступ</span>
                    <ChevronRight size={16} aria-hidden />
                  </button>
                </li>
                {modOn(siteSettings, 'friends') ? (
                  <li>
                    <Link href="/friends" onClick={closeMenu} className="mobile-menu__row">
                      <Users size={20} aria-hidden />
                      <span>Друзья</span>
                      <ChevronRight size={16} aria-hidden />
                    </Link>
                  </li>
                ) : null}
                {modOn(siteSettings, 'messaging') ? (
                  <li>
                    <Link href="/messages" onClick={closeMenu} className="mobile-menu__row">
                      <MessageCircle size={20} aria-hidden />
                      <span>Сообщения</span>
                      <ChevronRight size={16} aria-hidden />
                    </Link>
                  </li>
                ) : null}
                <li>
                  <Link href="/tickets" onClick={closeMenu} className="mobile-menu__row">
                    <Ticket size={20} aria-hidden />
                    <span>Билеты</span>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard/guides" onClick={closeMenu} className="mobile-menu__row">
                    <BookOpen size={20} aria-hidden />
                    <span>Инструктажи</span>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
                {modOn(siteSettings, 'achievements') ? (
                  <li>
                    <Link href="/dashboard/achievements" onClick={closeMenu} className="mobile-menu__row">
                      <Award size={20} aria-hidden />
                      <span>Достижения</span>
                      <ChevronRight size={16} aria-hidden />
                    </Link>
                  </li>
                ) : null}
                {modOn(siteSettings, 'eco') ? (
                  <li>
                    <Link href="/dashboard/shop" onClick={closeMenu} className="mobile-menu__row">
                      <ShoppingBag size={20} aria-hidden />
                      <span>Магазин</span>
                      <ChevronRight size={16} aria-hidden />
                    </Link>
                  </li>
                ) : null}
                <li>
                  <Link href="/dashboard/settings" onClick={closeMenu} className="mobile-menu__row">
                    <Settings size={20} aria-hidden />
                    <span>Настройки аккаунта</span>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
                {isStaff ? (
                  <li>
                    <Link href="/admin" onClick={closeMenu} className="mobile-menu__row">
                      <Shield size={20} aria-hidden />
                      <span>Панель</span>
                      <ChevronRight size={16} aria-hidden />
                    </Link>
                  </li>
                ) : null}
              </ul>
            )}
            {session && (isScanner || isTech) && (
              <ul className="mobile-menu__list" aria-label="Рабочее место">
                <li>
                  <button type="button" className="mobile-menu__row" onClick={openQuickPanel}>
                    <Zap size={20} aria-hidden />
                    <span>Быстрый доступ</span>
                    <ChevronRight size={16} aria-hidden />
                  </button>
                </li>
                <li>
                  <Link href={dashboardHref} onClick={closeMenu} className="mobile-menu__row">
                    <LayoutDashboard size={20} aria-hidden />
                    <span>{cabinetLabel}</span>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
              </ul>
            )}

            <div className="mobile-menu__section-label">Разделы сайта</div>
            <ul className="mobile-menu__list" aria-label="Разделы сайта">
              {headerMainPages.map((page: any) => (
                <li key={page.id}>
                  <Link
                    href={publicPagePath(page.slug)}
                    onClick={closeMenu}
                    className="mobile-menu__row"
                    style={getLinkStyle(publicPagePath(page.slug))}
                  >
                    <Sparkles size={20} aria-hidden />
                    <span>{page.title}</span>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
              ))}
              {modOn(siteSettings, 'projects') ? (
              <li>
                <Link href="/projects" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/projects')}>
                  <Sparkles size={20} aria-hidden />
                  <span>Проекты</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
              ) : null}
              {modOn(siteSettings, 'clubs') ? (
              <li>
                <Link href="/clubs" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/clubs')}>
                  <Users size={20} aria-hidden />
                  <span>Клубы</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
              ) : null}
              {modOn(siteSettings, 'spaces') ? (
              <li>
                <Link href="/spaces" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/spaces')}>
                  <Building2 size={20} aria-hidden />
                  <span>Пространства</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
              ) : null}
              {modOn(siteSettings, 'places') && (
              <li>
                <Link href="/places" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/places')}>
                  <MapPin size={20} aria-hidden />
                  <span>Куда сходить</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
              )}
              {modOn(siteSettings, 'events') ? (
              <li>
                <Link href="/events" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/events')}>
                  <CalendarDays size={20} aria-hidden />
                  <span>Афиша</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
              ) : null}
              {(siteSettings?.galleryPageEnabled ?? true) && modOn(siteSettings, 'gallery') && (
                <li>
                  <Link href="/gallery" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/gallery')}>
                    <ImageIcon size={20} aria-hidden />
                    <span>Галерея</span>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
              )}
              {modOn(siteSettings, 'news') ? (
              <li>
                <Link href="/news" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/news')}>
                  <Newspaper size={20} aria-hidden />
                  <span>Новости</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
              ) : null}
              {modOn(siteSettings, 'vacancies') && (
                <li>
                  <Link href="/vacancies" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/vacancies')}>
                    <Briefcase size={20} aria-hidden />
                    <span>Вакансии</span>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
              )}
              {modOn(siteSettings, 'contests') && (
                <li>
                  <Link href="/contests" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/contests')}>
                    <Award size={20} aria-hidden />
                    <span>Конкурсы</span>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
              )}
              {modOn(siteSettings, 'grants') ? (
              <li>
                <Link href="/grants" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/grants')}>
                  <Landmark size={20} aria-hidden />
                  <span>Гранты</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
              ) : null}
              {modOn(siteSettings, 'dobro') ? (
              <li>
                <Link href="/dobro" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/dobro')}>
                  <HandHeart size={20} aria-hidden />
                  <span>Добро</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
              ) : null}
              {modOn(siteSettings, 'self_gov') ? (
              <li>
                <Link href="/self-gov" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/self-gov')}>
                  <Landmark size={20} aria-hidden />
                  <span>Самоуправление</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
              ) : null}
              {modOn(siteSettings, 'documents') ? (
              <li>
                <Link href="/documents" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/documents')}>
                  <FileText size={20} aria-hidden />
                  <span>Документы</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
              ) : null}
              {modOn(siteSettings, 'games') && (
              <li>
                <Link href="/games" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/games')}>
                  <Gamepad2 size={20} aria-hidden />
                  <span>Игры</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
              )}
              <li>
                <Link href="/contacts" onClick={closeMenu} className="mobile-menu__row" style={getLinkStyle('/contacts')}>
                  <Phone size={20} aria-hidden />
                  <span>Контакты</span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
            </ul>

            {headerSubPages.length > 0 && (
              <>
                <div className="mobile-menu__section-label">Ещё</div>
                <ul className="mobile-menu__list">
                  {headerSubPages.map((page: any) => (
                    <li key={page.id}>
                      <Link
                        href={publicPagePath(page.slug)}
                        onClick={closeMenu}
                        className="mobile-menu__row mobile-menu__row--sub"
                      >
                        <Sparkles size={20} aria-hidden />
                        <span>{page.title}</span>
                        <ChevronRight size={16} aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {session && (
              <div className="mobile-menu__foot">
                <button
                  type="button"
                  className="mobile-menu__logout"
                  onClick={() => {
                    closeMenu();
                    void signOutLogged({ callbackUrl: '/' });
                  }}
                >
                  <LogOut size={18} aria-hidden />
                  Выйти из аккаунта
                </button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
