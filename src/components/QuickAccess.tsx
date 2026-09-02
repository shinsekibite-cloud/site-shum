'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Award,
  Building2,
  CalendarDays,
  Contact,
  FileText,
  Gamepad2,
  HandHeart,
  Home,
  Landmark,
  MapPin,
  MessageCircle,
  Newspaper,
  ScanLine,
  Search,
  Settings,
  Shield,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  QUICK_ACCESS_OPEN_EVENT,
  QUICK_ACCESS_TUTORIAL_EVENT,
  type QuickAccessTutorialEventDetail,
} from '@/lib/quick-access';
import {
  filterHotkeysForRole,
  hasBlockingOverlay,
  isEditableHotkeyTarget,
  normalizeHotkeyKey,
  type HotkeyDef,
} from '@/lib/quick-access-hotkeys';
import { QuickAccessTutorial } from '@/components/QuickAccessTutorial';

function itemIcon(item: HotkeyDef): ReactNode {
  const props = { size: 22, strokeWidth: 1.85, 'aria-hidden': true as const };
  switch (item.keys) {
    case 'G H':
      return <Home {...props} />;
    case 'G E':
      return <CalendarDays {...props} />;
    case 'G N':
      return <Newspaper {...props} />;
    case 'G P':
      return <Sparkles {...props} />;
    case 'G M':
      return <Building2 {...props} />;
    case 'G Q':
      return <MapPin {...props} />;
    case 'G L':
      return <Users {...props} />;
    case 'G K':
      return <Landmark {...props} />;
    case 'G V':
      return <HandHeart {...props} />;
    case 'G Y':
      return <Shield {...props} />;
    case 'G F':
      return <FileText {...props} />;
    case 'G G':
      return <Gamepad2 {...props} />;
    case 'G O':
      return <Contact {...props} />;
    case 'G C':
      return <MessageCircle {...props} />;
    case 'G R':
      return <Users {...props} />;
    case 'G D':
      return <User {...props} />;
    case 'G U':
      return <Settings {...props} />;
    case 'G A':
      return <Award {...props} />;
    case 'G S':
      return <ScanLine {...props} />;
    case 'G T':
      return <Shield {...props} />;
    case '/':
      return <Search {...props} />;
    default:
      return <Sparkles {...props} />;
  }
}

function shortLabel(label: string) {
  // Keep Samsung-like short captions under icons
  const map: Record<string, string> = {
    Главная: 'Главная',
    Афиша: 'Афиша',
    Новости: 'Новости',
    Проекты: 'Проекты',
    Пространства: 'Площадки',
    'Куда сходить': 'Места',
    Клубы: 'Клубы',
    Гранты: 'Гранты',
    Добро: 'Добро',
    Самоуправление: 'Самоупр.',
    Документы: 'Документы',
    Игры: 'Игры',
    Контакты: 'Контакты',
    Сообщения: 'Сообщения',
    Друзья: 'Друзья',
    Профиль: 'Профиль',
    Настройки: 'Настройки',
    Достижения: 'Достиж.',
    Сканер: 'Сканер',
    Админ: 'Админ',
    Поиск: 'Поиск',
  };
  return map[label] || label.slice(0, 10);
}

export function QuickAccess() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const [open, setOpen] = useState(false);
  const [chord, setChord] = useState<string | null>(null);
  const [tutorialForce, setTutorialForce] = useState(false);
  const [tutorialNonce, setTutorialNonce] = useState(0);

  const hideChrome =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/scanner') ||
    pathname.startsWith('/ops') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/maintenance') ||
    pathname.startsWith('/games');

  const items = useMemo(() => filterHotkeysForRole(role), [role]);

  const focusSiteSearch = useCallback(() => {
    const candidates = [
      ...document.querySelectorAll<HTMLInputElement>(
        'input[type="search"], input[name="q"], input[placeholder*="Поиск"], input[placeholder*="поиск"]'
      ),
    ];
    const visible = candidates.find((el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (visible) {
      visible.focus();
      visible.select?.();
      return true;
    }
    return false;
  }, []);

  const runItem = useCallback(
    (item: HotkeyDef) => {
      if (item.action === 'help') {
        setOpen(true);
        return;
      }
      setOpen(false);
      if (item.action === 'home') {
        router.push('/');
        return;
      }
      if (item.action === 'back') {
        if (typeof window !== 'undefined' && window.history.length > 1) router.back();
        else router.push('/');
        return;
      }
      if (item.action === 'search') {
        if (!focusSiteSearch()) router.push('/search');
        return;
      }
      if (item.href) router.push(item.href);
    },
    [focusSiteSearch, router]
  );

  const openPanel = useCallback(() => setOpen(true), []);
  const closePanel = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onTutorial = (event: Event) => {
      const detail = (event as CustomEvent<QuickAccessTutorialEventDetail>).detail;
      setTutorialForce(Boolean(detail?.force));
      setTutorialNonce((n) => n + 1);
    };
    window.addEventListener(QUICK_ACCESS_OPEN_EVENT, onOpen);
    window.addEventListener(QUICK_ACCESS_TUTORIAL_EVENT, onTutorial as EventListener);
    return () => {
      window.removeEventListener(QUICK_ACCESS_OPEN_EVENT, onOpen);
      window.removeEventListener(QUICK_ACCESS_TUTORIAL_EVENT, onTutorial as EventListener);
    };
  }, []);

  // Edge swipe from right to open (Samsung-like)
  useEffect(() => {
    if (hideChrome) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      if (open || e.touches.length !== 1) return;
      const t = e.touches[0];
      const fromRight = t.clientX >= window.innerWidth - 28;
      if (!fromRight) return;
      tracking = true;
      startX = t.clientX;
      startY = t.clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = startX - t.clientX;
      const dy = Math.abs(t.clientY - startY);
      if (dx > 36 && dy < 40) {
        tracking = false;
        setOpen(true);
      }
    };
    const onEnd = () => {
      tracking = false;
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [hideChrome, open]);

  useEffect(() => {
    let pendingG = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearPending = () => {
      pendingG = false;
      setChord(null);
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (pathname.startsWith('/games')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableHotkeyTarget(e.target)) return;

      const key = normalizeHotkeyKey(e.key);

      if (key === 'Esc') {
        if (open) {
          e.preventDefault();
          closePanel();
          clearPending();
          return;
        }
        if (hasBlockingOverlay()) return;
        e.preventDefault();
        clearPending();
        runItem({ keys: 'Esc', label: 'Назад', action: 'back' });
        return;
      }

      if (key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        clearPending();
        setOpen(true);
        return;
      }

      if (key === '/') {
        e.preventDefault();
        clearPending();
        runItem({ keys: '/', label: 'Поиск', action: 'search' });
        return;
      }

      if (key === 'G' && !pendingG) {
        pendingG = true;
        setChord('G');
        timer = setTimeout(clearPending, 1200);
        return;
      }

      if (pendingG) {
        const combo = `G ${key}`;
        const match = items.find((item) => item.keys === combo);
        clearPending();
        if (match) {
          e.preventDefault();
          runItem(match);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, [items, open, runItem, pathname, closePanel]);

  const panelItems = items.filter((i) => i.action !== 'help' && i.action !== 'back');
  const navItems = panelItems.filter((i) => i.group === 'nav' || !i.group);
  const accountItems = panelItems.filter((i) => i.group === 'account');
  const staffItems = panelItems.filter((i) => i.group === 'staff');
  const systemItems = panelItems.filter((i) => i.group === 'system');

  const renderItem = (item: HotkeyDef) => {
    const body = (
      <>
        <span className="qa-edge-icon">{itemIcon(item)}</span>
        <span className="qa-edge-label">{shortLabel(item.label)}</span>
      </>
    );
    if (item.href && item.action !== 'search') {
      return (
        <Link
          key={item.keys}
          href={item.href}
          className="qa-edge-item"
          title={`${item.label} (${item.keys})`}
          onClick={() => setOpen(false)}
        >
          {body}
        </Link>
      );
    }
    return (
      <button
        key={item.keys}
        type="button"
        className="qa-edge-item"
        title={`${item.label} (${item.keys})`}
        onClick={() => runItem(item)}
      >
        {body}
      </button>
    );
  };

  return (
    <>
      {!hideChrome && !open && (
        <button
          type="button"
          className="qa-fab"
          aria-label="Быстрый доступ"
          title="Быстрый доступ"
          onClick={openPanel}
        >
          <span className="qa-fab-grip" aria-hidden />
          <span className="qa-fab-caption">меню</span>
        </button>
      )}

      {open && (
        <div className="qa-sheet-root" role="dialog" aria-modal="true" aria-label="Быстрый доступ">
          <button type="button" className="qa-sheet-backdrop" aria-label="Закрыть" onClick={closePanel} />
          <aside className="qa-sheet qa-edge-panel">
            <div className="qa-edge-scroll">
              {navItems.map(renderItem)}
              {(accountItems.length > 0 || staffItems.length > 0) && (
                <div className="qa-edge-sep" aria-hidden />
              )}
              {accountItems.map(renderItem)}
              {staffItems.map(renderItem)}
              {systemItems.length > 0 && <div className="qa-edge-sep" aria-hidden />}
              {systemItems.map(renderItem)}
            </div>
            <div className="qa-edge-foot">
              <button type="button" className="qa-edge-foot-btn" onClick={closePanel} aria-label="Закрыть">
                <X size={18} />
              </button>
              <Link
                href={role === 'TECH' ? '/ops' : role === 'SCANNER' ? '/scanner' : '/dashboard/settings'}
                className="qa-edge-foot-btn"
                aria-label="Настройки"
                title="Настройки"
                onClick={() => setOpen(false)}
              >
                <Settings size={16} />
              </Link>
            </div>
          </aside>
        </div>
      )}

      {chord && !open && (
        <div className="qa-chord-toast" role="status">
          Ждём вторую клавишу: <kbd>{chord}</kbd> …
        </div>
      )}

      <QuickAccessTutorial forceOpen={tutorialForce} restartKey={tutorialNonce} />
    </>
  );
}

export default QuickAccess;
