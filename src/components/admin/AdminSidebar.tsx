'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Folder,
  Calendar,
  FileText,
  Settings,
  Clock,
  Newspaper,
  BarChart3,
  ScanLine,
  LogOut,
  ScrollText,
  FileStack,
  HandHeart,
  Briefcase,
  ShieldAlert,
  DatabaseBackup,
  MapPin,
  Trophy,
  Bot,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Menu,
  Shield,
  Server,
  Award,
  UsersRound,
  Home,
  UserCircle,
} from 'lucide-react';
import { hasPermission, type ModeratorPermission } from '@/lib/acl-shared';
import NotificationsBell from '@/components/NotificationsBell';
import { signOutLogged } from '@/lib/sign-out-logged';

type NavDef = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  requiredPermission?: ModeratorPermission | ModeratorPermission[] | 'ADMIN_ONLY';
  group: 'main' | 'content' | 'ops' | 'system';
  badgeKey?: string;
};

const NAV_ITEMS: NavDef[] = [
  { href: '/admin', label: 'Дашборд', icon: LayoutDashboard, group: 'main' },
  { href: '/admin/projects', label: 'Проекты', icon: Folder, requiredPermission: 'projects', group: 'content' },
  { href: '/admin/clubs', label: 'Клубы', icon: Users, requiredPermission: 'clubs', group: 'content' },
  { href: '/admin/spaces', label: 'Пространства', icon: Calendar, requiredPermission: 'spaces', group: 'content' },
  { href: '/admin/places', label: 'Куда сходить', icon: MapPin, requiredPermission: 'places', group: 'content' },
  { href: '/admin/programs', label: 'Гранты и добро', icon: HandHeart, requiredPermission: ['programs', 'pages'], group: 'content' },
  { href: '/admin/bookings', label: 'Афиша', icon: Clock, requiredPermission: 'bookings', group: 'ops', badgeKey: '/admin/bookings' },
  { href: '/admin/pages', label: 'Страницы', icon: ScrollText, requiredPermission: 'pages', group: 'content' },
  { href: '/admin/faq', label: 'FAQ', icon: FileText, requiredPermission: 'pages', group: 'content' },
  { href: '/admin/about-team', label: 'Команда «О нас»', icon: Users, requiredPermission: ['pages', 'portfolios'], group: 'content' },
  { href: '/admin/documents', label: 'Документы', icon: FileStack, requiredPermission: 'pages', group: 'content' },
  { href: '/admin/news', label: 'Новости', icon: Newspaper, requiredPermission: ['news', 'pages'], group: 'content' },
  { href: '/admin/applications', label: 'Заявки', icon: FileText, requiredPermission: 'applications', group: 'ops', badgeKey: '/admin/applications' },
  { href: '/admin/portfolios', label: 'Портфолио', icon: Briefcase, requiredPermission: ['portfolios', 'pages'], group: 'ops', badgeKey: '/admin/portfolios' },
  { href: '/admin/awards', label: 'Награды', icon: Award, requiredPermission: ['portfolios', 'pages'], group: 'ops' },
  { href: '/admin/vacancies', label: 'Вакансии', icon: Briefcase, requiredPermission: 'vacancies', group: 'ops' },
  { href: '/admin/contests', label: 'Конкурсы', icon: Trophy, requiredPermission: 'contests', group: 'ops' },
  { href: '/admin/moderation', label: 'Модерация', icon: ShieldAlert, requiredPermission: 'moderation', group: 'ops', badgeKey: '/admin/moderation' },
  { href: '/admin/security', label: 'IP и подозрительные', icon: Shield, requiredPermission: ['moderation'], group: 'ops' },
  { href: '/admin/stats', label: 'Статистика', icon: BarChart3, requiredPermission: ['stats', 'bookings'], group: 'ops' },
  { href: '/admin/scanner', label: 'Сканер', icon: ScanLine, requiredPermission: 'scanner', group: 'ops' },
  { href: '/admin/users', label: 'Пользователи', icon: Users, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/pending-users', label: 'Заявки регистрации', icon: UserPlus, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/audit-log', label: 'Журнал админов', icon: ScrollText, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/rkn', label: 'РКН / ПДн', icon: FileText, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/backup', label: 'Бэкап', icon: DatabaseBackup, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/bots', label: 'Боты', icon: Bot, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/system', label: 'Состояние сервера', icon: Server, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/online', label: 'Онлайн', icon: UsersRound, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/activity', label: 'Активность', icon: Activity, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/settings', label: 'Настройки сайта', icon: Settings, requiredPermission: 'ADMIN_ONLY', group: 'system' },
];

const GROUP_LABELS: Record<NavDef['group'], string> = {
  main: 'Обзор',
  content: 'Контент',
  ops: 'Операции',
  system: 'Система',
};

const COLLAPSE_KEY = 'yp-admin-sidebar-collapsed';

function canSee(item: NavDef, userRole: string, userPermissions: string[]): boolean {
  if (userRole === 'ADMIN') return true;
  if (item.requiredPermission === 'ADMIN_ONLY') return false;
  if (!item.requiredPermission) return true;
  const raw = userPermissions.join(',');
  return hasPermission(
    'MODERATOR',
    raw,
    item.requiredPermission as ModeratorPermission | ModeratorPermission[]
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function formatBadge(n: number) {
  if (n <= 0) return null;
  return n > 999 ? '999+' : String(n);
}

export default function AdminSidebar({
  userRole,
  userPermissions,
}: {
  userRole: string;
  userPermissions: string[];
}) {
  const pathname = usePathname() || '/admin';
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [navQuery, setNavQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  const items = useMemo(() => {
    const visible = NAV_ITEMS.filter((item) => canSee(item, userRole, userPermissions));
    const q = navQuery.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter(
      (item) => item.label.toLowerCase().includes(q) || item.href.toLowerCase().includes(q)
    );
  }, [userRole, userPermissions, navQuery]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetch('/api/admin/nav-counts')
        .then((r) => r.json())
        .then((d) => {
          if (cancelled || !d?.counts) return;
          setCounts(d.counts as Record<string, number>);
        })
        .catch(() => undefined);
    };
    load();
    const t = setInterval(load, 180000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const toggleCollapse = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const badgeFor = (item: NavDef) => {
    if (!item.badgeKey) return null;
    return formatBadge(counts[item.badgeKey] || 0);
  };

  const renderNav = (opts: { compact: boolean; idPrefix: string }) => (
    <nav className="samsung-nav" aria-label="Админ-навигация">
      {(['main', 'content', 'ops', 'system'] as const).map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (!groupItems.length) return null;
        return (
          <div key={group} className="samsung-nav__group">
            {!opts.compact ? (
              <div className="samsung-nav__group-label">{GROUP_LABELS[group]}</div>
            ) : (
              <div className="samsung-nav__group-rule" aria-hidden />
            )}
            {groupItems.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);
              const badge = badgeFor(item);
              return (
                <Link
                  key={`${opts.idPrefix}-${item.href}`}
                  href={item.href}
                  className={`samsung-nav__link${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                  onClick={() => setDrawerOpen(false)}
                >
                  <span className="samsung-nav__icon">
                    <Icon size={18} />
                  </span>
                  {!opts.compact ? <span className="samsung-nav__label">{item.label}</span> : null}
                  {!opts.compact && badge ? <span className="samsung-nav__badge">{badge}</span> : null}
                  {opts.compact && badge ? <span className="samsung-nav__dot" aria-label={badge} /> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
      <div className="samsung-nav__group samsung-nav__group--foot">
        <Link
          href="/"
          className="samsung-nav__link samsung-nav__link--site"
          title="На главную сайта"
          onClick={() => setDrawerOpen(false)}
        >
          <span className="samsung-nav__icon">
            <Home size={18} />
          </span>
          {!opts.compact ? <span className="samsung-nav__label">На сайт</span> : null}
        </Link>
        <Link
          href="/dashboard"
          className="samsung-nav__link"
          title="Профиль"
          onClick={() => setDrawerOpen(false)}
        >
          <span className="samsung-nav__icon">
            <UserCircle size={18} />
          </span>
          {!opts.compact ? <span className="samsung-nav__label">Профиль</span> : null}
        </Link>
        <button
          type="button"
          className="samsung-nav__link"
          title="Выйти"
          onClick={() => void signOutLogged({ callbackUrl: '/' })}
        >
          <span className="samsung-nav__icon">
            <LogOut size={18} />
          </span>
          {!opts.compact ? <span className="samsung-nav__label">Выйти</span> : null}
        </button>
      </div>
    </nav>
  );

  return (
    <>
      <div className="admin-mobile-bar">
        <button
          type="button"
          className="admin-mobile-bar__menu"
          aria-label="Открыть меню панели"
          aria-expanded={drawerOpen}
          aria-controls="admin-nav-drawer"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={18} />
        </button>
        <div className="admin-mobile-bar__meta">
          <strong>Панель управления</strong>
          <span>Управление порталом</span>
        </div>
        <div className="admin-mobile-bar__actions">
          <Link href="/" className="admin-mobile-bar__icon" title="Главная" aria-label="Главная">
            <Home size={18} />
          </Link>
          <Link href="/dashboard" className="admin-mobile-bar__icon" title="Профиль" aria-label="Профиль">
            <UserCircle size={18} />
          </Link>
          <NotificationsBell compact useNavStyle />
        </div>
      </div>

      <aside
        className={`samsung-sidebar${collapsed ? ' is-collapsed' : ''}`}
        data-collapsed={collapsed ? '1' : '0'}
        aria-label="Навигация панели"
      >
        <div className="samsung-sidebar__head">
          {!collapsed ? (
            <Link href="/" className="samsung-sidebar__title" title="На главную сайта">
              Панель управления
            </Link>
          ) : (
            <Link href="/" className="samsung-sidebar__home-collapsed" title="Главная" aria-label="Главная">
              <Home size={18} />
            </Link>
          )}
          <div className="samsung-sidebar__head-actions">
            {!collapsed ? <NotificationsBell compact useNavStyle /> : null}
            <button
              type="button"
              className="samsung-sidebar__collapse"
              aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
              title={collapsed ? 'Развернуть' : 'Свернуть'}
              onClick={toggleCollapse}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </div>
        </div>
        {!collapsed ? (
          <div className="samsung-sidebar__search">
            <input
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              placeholder="Поиск…"
              aria-label="Поиск раздела панели"
            />
          </div>
        ) : null}
        {renderNav({ compact: collapsed, idPrefix: 'desk' })}
      </aside>

      {portalReady
        ? createPortal(
            <div
              id="admin-nav-drawer"
              className={`samsung-drawer${drawerOpen ? ' is-open' : ''}`}
              aria-hidden={!drawerOpen}
              hidden={!drawerOpen}
            >
              <button
                type="button"
                className="samsung-drawer__backdrop"
                aria-label="Закрыть меню"
                tabIndex={drawerOpen ? 0 : -1}
                onClick={() => setDrawerOpen(false)}
              />
              <div className="samsung-drawer__panel" role="dialog" aria-modal="true" aria-label="Меню панели">
                <div className="samsung-drawer__head">
                  <strong>Панель управления</strong>
                  <div className="samsung-drawer__head-actions">
                    <Link href="/" aria-label="Главная" title="Главная" onClick={() => setDrawerOpen(false)}>
                      <Home size={18} />
                    </Link>
                    <button type="button" aria-label="Закрыть" onClick={() => setDrawerOpen(false)}>
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div className="samsung-sidebar__search">
                  <input
                    value={navQuery}
                    onChange={(e) => setNavQuery(e.target.value)}
                    placeholder="Поиск…"
                    aria-label="Поиск раздела"
                  />
                </div>
                <div className="samsung-drawer__nav-scroll">
                  {renderNav({ compact: false, idPrefix: 'drawer' })}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
