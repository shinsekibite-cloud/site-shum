'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { GAMES, type GameId } from '@/lib/games';
import { flushGameScoreQueue, getLocalBest, reportSecretMenuFound } from '@/lib/game-scores-client';
import { brandNameLines, DEFAULT_SITE_NAME } from '@/lib/site-identity-shared';

const TAP_WINDOW_MS = 2200;
const TAPS_NEEDED = 5;
/** Single-tap home only after this delay — cancels if another tap arrives first. */
const SINGLE_TAP_NAV_MS = 420;

type Props = {
  siteName?: string | null;
  logoUrl?: string | null;
  href?: string;
  size?: 'header' | 'footer' | 'compact';
  showName?: boolean;
  className?: string;
};

const DEFAULT_LOGO = '/brand/logo-mark.png';
/** Full CRM emblem — readable in the footer, too detailed for the 40px header slot. */
const FOOTER_LOGO = '/brand/crm-sochi-logo-transparent.png';
/** Wordmark / tall lockups — header uses the square mark so the HTML name stays the title. */
const WORDMARK_LOGOS = new Set([
  '/brand/logo-crm-sochi.png',
  '/brand/logo-crm-sochi-alt.png',
  '/brand/crm-sochi-logo-transparent.png',
  '/brand/crm-sochi-logo.png',
  '/brand/logo.png',
]);

function resolveBrandSrc(rawLogo: string, size: Props['size']) {
  const isWordmark =
    !rawLogo ||
    WORDMARK_LOGOS.has(rawLogo) ||
    rawLogo.includes('crm-sochi-logo') ||
    rawLogo.endsWith('logo-crm-sochi.png') ||
    rawLogo.endsWith('logo-crm-sochi-alt.png');
  if (size === 'footer') return isWordmark ? FOOTER_LOGO : rawLogo;
  return isWordmark ? DEFAULT_LOGO : rawLogo;
}

const DESC: Record<GameId, string> = {
  snake: 'Змейка',
  tetris: 'Тетрис',
  checkers: 'Шашки',
  breakout: 'Арканоид',
  memory: 'Память',
  fifteen: 'Пятнашки',
};

export default function SiteBrand({
  siteName,
  logoUrl,
  href = '/',
  size = 'header',
  showName = true,
  className,
}: Props) {
  const router = useRouter();
  const name = siteName?.trim() || DEFAULT_SITE_NAME;
  const nameLines = brandNameLines(name);
  const rawLogo = (logoUrl && logoUrl.trim()) || '';
  const src = resolveBrandSrc(rawLogo, size);
  const [menuOpen, setMenuOpen] = useState(false);
  const tapCountRef = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dims =
    size === 'footer'
      ? { box: 72 }
      : size === 'compact'
        ? { box: 32 }
        : { box: 40 };

  const clearTimers = () => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
    if (navTimer.current) {
      clearTimeout(navTimer.current);
      navTimer.current = null;
    }
  };

  const openSecretMenu = useCallback(() => {
    clearTimers();
    setMenuOpen(true);
    tapCountRef.current = 0;
    void reportSecretMenuFound();
    void flushGameScoreQueue();
  }, []);

  /**
   * 5 быстрых тапов по логотипу — секретное меню.
   * Один тап — переход на главную (после SHORT delay, отменяется 2-м тапом).
   * Серия 2–4 без пятого просто сбрасывается — без ухода на главную.
   */
  const onLogoTap = useCallback(
    (e: React.PointerEvent | React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if ('button' in e && typeof e.button === 'number' && e.button !== 0) return;

      // Cancel pending single-tap navigation on every new tap
      if (navTimer.current) {
        clearTimeout(navTimer.current);
        navTimer.current = null;
      }
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }

      tapCountRef.current += 1;

      if (tapCountRef.current >= TAPS_NEEDED) {
        openSecretMenu();
        return;
      }

      if (tapCountRef.current === 1) {
        navTimer.current = setTimeout(() => {
          if (tapCountRef.current === 1) {
            tapCountRef.current = 0;
            router.push(href);
          }
        }, SINGLE_TAP_NAV_MS);
      }

      resetTimer.current = setTimeout(() => {
        tapCountRef.current = 0;
      }, TAP_WINDOW_MS);
    },
    [href, openSecretMenu, router]
  );

  useEffect(() => {
    return () => clearTimers();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const rootClass = ['site-brand', `site-brand--${size}`, className].filter(Boolean).join(' ');

  return (
    <>
      <div className={rootClass}>
        <button
          type="button"
          className="site-brand-mark"
          onPointerUp={onLogoTap}
          onClick={(e) => {
            // Prevent accidental form/link ancestors; tap handled on pointerup
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-label={`${name} — 5 нажатий открывают игры`}
          style={{ width: dims.box, height: dims.box }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="site-brand-logo"
            src={src}
            alt=""
            width={dims.box}
            height={dims.box}
            decoding="async"
            draggable={false}
          />
        </button>
        {showName && (
          <Link href={href} className="site-brand-link" aria-label={name}>
            <span className={`site-brand-name${nameLines.length > 1 ? ' is-stacked' : ''}`}>
              {nameLines.map((line, i) => (
                <span key={`${line}-${i}`} className="site-brand-name__line">
                  {line}
                </span>
              ))}
            </span>
          </Link>
        )}
      </div>

      {menuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Секретное меню игр"
          className="site-brand-games-backdrop"
          onClick={() => setMenuOpen(false)}
        >
          <div className="site-brand-games" onClick={(e) => e.stopPropagation()}>
            <div className="site-brand-games__head">
              <div>
                <div className="site-brand-games__title">Секретные игры</div>
                <p className="site-brand-games__sub">Работают и без интернета</p>
              </div>
              <button
                type="button"
                aria-label="Закрыть"
                className="site-brand-games__close"
                onClick={() => setMenuOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="site-brand-games__list">
              {(Object.keys(GAMES) as GameId[]).map((id) => {
                const g = GAMES[id];
                const best = typeof window !== 'undefined' ? getLocalBest(id) : 0;
                return (
                  <Link
                    key={id}
                    href={g.path}
                    onClick={() => setMenuOpen(false)}
                    className="site-brand-games__item"
                  >
                    <span className="site-brand-games__item-label">
                      <span className="site-brand-games__dot" style={{ background: g.accent }} />
                      {DESC[id]}
                    </span>
                    {best > 0 ? (
                      <span className="site-brand-games__best">{best}</span>
                    ) : (
                      <span className="site-brand-games__best is-empty">→</span>
                    )}
                  </Link>
                );
              })}
            </div>
            <Link href="/games" onClick={() => setMenuOpen(false)} className="site-brand-games__all">
              Все игры
            </Link>
            <a href="/offline-games/" onClick={() => setMenuOpen(false)} className="site-brand-games__offline">
              Офлайн-версия (без сети)
            </a>
          </div>
        </div>
      )}
    </>
  );
}

export { DEFAULT_LOGO, FOOTER_LOGO };
