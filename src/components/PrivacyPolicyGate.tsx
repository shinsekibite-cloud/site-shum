'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { PRIVACY_POLICY_VERSION } from '@/lib/consent-versions';
import { signOutLogged } from '@/lib/sign-out-logged';

/** Paths still available while privacy re-consent is required. */
const ALLOWED_WHEN_BLOCKED = [
  '/privacy',
  '/rules',
  '/contacts',
  '/login',
  '/logout',
  '/register',
  '/verify',
  '/forgot-password',
  '/ops',
];

function isAllowedPath(pathname: string) {
  return ALLOWED_WHEN_BLOCKED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function PrivacyPolicyGate() {
  const { data: session, status } = useSession();
  const pathname = usePathname() || '/';
  const [needed, setNeeded] = useState(false);
  const [refused, setRefused] = useState(false);
  const [version, setVersion] = useState(PRIVACY_POLICY_VERSION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const refresh = useCallback(() => {
    if (status !== 'authenticated' || !session?.user) {
      setNeeded(false);
      setRefused(false);
      return;
    }
    fetch('/api/user/consent')
      .then((r) => r.json())
      .then((data) => {
        const need = Boolean(data?.needsPrivacyReconsent);
        setNeeded(need);
        setRefused(Boolean(data?.privacyRefusedAt));
        if (data?.currentPrivacyVersion) setVersion(data.currentPrivacyVersion);
      })
      .catch(() => {
        /* ignore network — don't lock out on fetch fail */
      });
  }, [session, status]);

  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/user/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacy: true, cookies: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Не удалось сохранить согласие');
        return;
      }
      setNeeded(Boolean(data.needsPrivacyReconsent));
      setRefused(false);
      window.dispatchEvent(new Event('yp-privacy-accepted'));
    } catch {
      setError('Ошибка сети');
    } finally {
      setBusy(false);
    }
  };

  const refuse = async () => {
    setBusy(true);
    setError('');
    try {
      await fetch('/api/user/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refusePrivacy: true }),
      });
      setRefused(true);
      setNeeded(true);
    } catch {
      setError('Ошибка сети');
    } finally {
      setBusy(false);
    }
  };

  if (!mounted || status !== 'authenticated' || !needed) return null;
  if (isAllowedPath(pathname)) return null;

  return createPortal(
    <div
      className="privacy-gate"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="privacy-gate-title"
      aria-describedby="privacy-gate-desc"
    >
      <div className="privacy-gate__card allow-select">
        <div
          className={`privacy-gate__icon${refused ? ' is-refused' : ''}`}
          aria-hidden
        >
          <ShieldAlert size={22} color={refused ? '#e11d48' : '#2563eb'} />
        </div>
        <h2 id="privacy-gate-title" className="privacy-gate__title">
          {refused ? 'Доступ ограничен' : 'Обновлена политика конфиденциальности'}
        </h2>
        <p id="privacy-gate-desc" className="privacy-gate__text">
          {refused
            ? 'Без согласия с актуальной политикой пользоваться порталом нельзя. Примите политику или выйдите из аккаунта.'
            : 'Мы обновили документ. Ознакомьтесь и примите новую версию — иначе доступ к сайту будет ограничен.'}
        </p>
        <p className="privacy-gate__meta">
          <Link href="/privacy" className="privacy-gate__link">
            Открыть политику конфиденциальности
          </Link>
          <span className="privacy-gate__ver"> · версия {version}</span>
        </p>

        {error ? <p className="privacy-gate__error">{error}</p> : null}

        <div className="privacy-gate__actions">
          <button
            type="button"
            className="btn btn-primary privacy-gate__btn"
            disabled={busy}
            onClick={accept}
          >
            {busy ? 'Сохранение…' : 'Принять и продолжить'}
          </button>
          <div className="privacy-gate__row">
            {!refused ? (
              <button
                type="button"
                className="btn btn-secondary privacy-gate__btn"
                disabled={busy}
                onClick={refuse}
              >
                Отказаться
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary privacy-gate__btn"
              disabled={busy}
              onClick={() => void signOutLogged({ callbackUrl: '/' })}
            >
              Выйти
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
