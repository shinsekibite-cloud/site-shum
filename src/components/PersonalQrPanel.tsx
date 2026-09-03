'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import { Maximize2, RefreshCw, Sparkles, Wallet, X } from 'lucide-react';
import { POINTS } from '@/lib/points-labels';
import './PersonalQrPanel.css';

type Scores = {
  mBall: number;
  ecoBall: number;
  ecoPoints?: number;
  ecoBallPublic: boolean;
  mLevel: { label: string; toNext: number; progress: number; nextLabel: string | null };
  ecoLevel: { label: string; toNext: number; progress: number; nextLabel: string | null };
};

type HistoryItem = {
  id: string;
  kind: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
};

function shopMilestone(points: number) {
  const n = Math.max(0, Math.floor(points || 0));
  const target = n < 50 ? 50 : n < 150 ? 150 : n < 400 ? 400 : n < 800 ? 800 : null;
  if (!target) {
    return { label: 'Магазин', toNext: 0, progress: 1, nextLabel: null as string | null };
  }
  const prev = target === 50 ? 0 : target === 150 ? 50 : target === 400 ? 150 : 400;
  return {
    label: 'Кошелёк',
    toNext: Math.max(0, target - n),
    progress: Math.min(1, (n - prev) / Math.max(1, target - prev)),
    nextLabel: `${target}`,
  };
}

export default function PersonalQrPanel() {
  const [url, setUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [scores, setScores] = useState<Scores | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!force) setLoading(true);
    try {
      const r = await fetch('/api/presence-qr', {
        method: force ? 'POST' : 'GET',
        credentials: 'same-origin',
        headers: force ? { 'Content-Type': 'application/json' } : undefined,
        body: force ? JSON.stringify({ action: 'rotate' }) : undefined,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Ошибка');
      const qr = data.qr || {};
      setUrl(qr.url || '');
      setExpiresAt(qr.expiresAt || null);
      if (data.scores) setScores(data.scores);
      if (data.history) setHistory(data.history);
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'Не удалось загрузить QR');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    document.body.classList.add('yp-modal-open');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('yp-modal-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  const shopLevel = shopMilestone(scores?.ecoPoints ?? 0);
  const mLevel = scores?.mLevel;
  const mPct = Math.round((mLevel?.progress ?? 0) * 100);
  const shopPts = (scores?.ecoPoints ?? 0).toLocaleString('ru-RU');

  const fsOverlay =
    fullscreen && url && mounted
      ? createPortal(
          <div className="presence-fs" role="dialog" aria-modal="true" aria-label="QR на весь экран">
            <header className="presence-fs__bar">
              <strong className="presence-fs__brand">Пропуск</strong>
              <button type="button" className="presence-fs__close" onClick={() => setFullscreen(false)}>
                <X size={16} aria-hidden />
                Закрыть
              </button>
            </header>
            <div className="presence-fs__body">
              <div className="presence-fs__card">
                <div className="presence-fs__title">Ваш пропуск</div>
                <p className="presence-fs__hint">Покажите сотруднику на ресепшен</p>
                <div className="presence-fs__qr">
                  <QRCodeDisplay value={url} size={280} />
                </div>
                {expiresAt ? (
                  <p className="presence-fs__meta">
                    до{' '}
                    {new Date(expiresAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
                  </p>
                ) : null}
              </div>
              <div className="presence-fs__scores">
                <div className="presence-fs__score">
                  <span className="presence-fs__score-label">{POINTS.shop.brand}</span>
                  <strong className="presence-fs__score-value">{shopPts}</strong>
                </div>
                <div className="presence-fs__score">
                  <span className="presence-fs__score-label">Репутация</span>
                  <strong className="presence-fs__score-value">{scores?.mBall ?? 0}</strong>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <section className="presence-panel presence-panel--compact" aria-label="Личный QR и баллы">
      <div className="presence-qr-card">
        <div className="presence-qr-card__head">
          <div className="presence-qr-card__title">Ваш пропуск</div>
          <p className="presence-qr-card__hint">Покажите на входе. Токен обновляется раз в сутки.</p>
        </div>
        {loading && !url ? <p className="presence-muted">Готовим QR…</p> : null}
        {error ? <p className="presence-error">{error}</p> : null}
        {url ? (
          <>
            <div className="presence-qr-wrap">
              <QRCodeDisplay value={url} size={168} />
            </div>
            {expiresAt ? (
              <p className="presence-qr-meta">
                до {new Date(expiresAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
              </p>
            ) : null}
            <div className="presence-qr-actions">
              <button type="button" className="presence-open-fs" onClick={() => setFullscreen(true)}>
                <Maximize2 size={16} aria-hidden />
                На весь экран
              </button>
              <button
                type="button"
                className="presence-refresh"
                onClick={() => load(true)}
                aria-label="Обновить QR"
              >
                <RefreshCw size={15} aria-hidden />
                Обновить
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="presence-scores">
        <Link
          href="/dashboard/shop"
          className="presence-score presence-score--btn presence-score--shop"
          aria-label={`Магазин: ${POINTS.shop.brand}`}
        >
          <div className="presence-score__top">
            <span className="presence-score__ico" aria-hidden>
              <Wallet size={14} />
            </span>
            <span className="presence-score__label">{POINTS.shop.brand}</span>
          </div>
          <div className="presence-score__value">{shopPts}</div>
          <div className="presence-score__bar" aria-hidden>
            <span className="presence-score__fill" style={{ width: `${Math.round(shopLevel.progress * 100)}%` }} />
          </div>
          <p className="presence-score__meta">можно тратить в магазине</p>
        </Link>

        <button
          type="button"
          className="presence-score presence-score--btn presence-score--rep"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('yp:open-rep', { detail: { tab: 'AUTHORITY' } }));
          }}
          aria-label={`Репутация за визиты (${POINTS.mBall.brand})`}
        >
          <div className="presence-score__top">
            <span className="presence-score__ico" aria-hidden>
              <Sparkles size={14} />
            </span>
            <span className="presence-score__label">Репутация</span>
          </div>
          <div className="presence-score__value">{scores?.mBall ?? 0}</div>
          <div className="presence-score__bar" aria-hidden>
            <span className="presence-score__fill" style={{ width: `${mPct}%` }} />
          </div>
          <p className="presence-score__meta">
            {mLevel?.label || 'Новичок'}
            {mLevel?.nextLabel ? ` · до «${mLevel.nextLabel}» ещё ${mLevel.toNext}` : ''}
          </p>
        </button>
      </div>

      {history.length > 0 ? (
        <div className="presence-history">
          <h3>История начислений</h3>
          <ul>
            {history.map((h) => (
              <li key={h.id}>
                <span className={`presence-delta ${h.delta >= 0 ? 'is-plus' : 'is-minus'}`}>
                  {h.delta >= 0 ? '+' : ''}
                  {h.delta} {h.kind === 'ECO_BALL' ? POINTS.ecoBall.short : POINTS.mBall.short}
                </span>
                <span className="presence-reason">{h.reason}</span>
                <time dateTime={h.createdAt}>
                  {new Date(h.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
                </time>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {fsOverlay}
    </section>
  );
}
