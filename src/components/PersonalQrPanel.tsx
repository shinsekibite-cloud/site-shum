'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import { Maximize2, RefreshCw, Sparkles, Wallet } from 'lucide-react';
import { POINTS } from '@/lib/points-labels';

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

  const load = useCallback(async (force = false) => {
    // First paint only — rotate keeps the current QR on screen.
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

  const shopLevel = shopMilestone(scores?.ecoPoints ?? 0);

  return (
    <section className="presence-panel" aria-label="Личный QR и баллы">
      <div className="presence-grid presence-grid--svc">
        <div className="presence-scores">
          <ScoreRing
            title={POINTS.mBall.brand}
            icon={<Sparkles size={18} />}
            value={scores?.mBall ?? 0}
            level={scores?.mLevel}
            tone="m"
          />
          <Link href="/dashboard/shop" className="score-ring score-ring-shop score-ring-link" aria-label="Магазин мбаллов">
            <div className="score-ring-top">
              <Wallet size={18} />
              <strong>{POINTS.shop.brand}</strong>
            </div>
            <div className="score-ring-value">{(scores?.ecoPoints ?? 0).toLocaleString('ru-RU')}</div>
            <div className="score-ring-bar" aria-hidden>
              <span style={{ width: `${Math.round(shopLevel.progress * 100)}%` }} />
            </div>
            <p className="score-ring-meta">
              {shopLevel.nextLabel
                ? `до ${shopLevel.nextLabel} ещё ${shopLevel.toNext}`
                : 'можно тратить в магазине'}
            </p>
          </Link>
        </div>

        <div className="presence-qr-card">
          <div className="presence-qr-head">
            <h2>Ваш пропуск</h2>
            <p>Покажите на входе. Токен обновляется раз в сутки.</p>
          </div>
          {loading && !url ? <p className="presence-muted">Готовим QR…</p> : null}
          {error ? <p className="presence-error">{error}</p> : null}
          {url ? (
            <div className="presence-qr-wrap">
              <QRCodeDisplay value={url} size={200} />
              <div className="presence-qr-actions">
                <button type="button" className="btn btn-primary" onClick={() => setFullscreen(true)}>
                  <Maximize2 size={16} /> На весь экран
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => load(true)}>
                  <RefreshCw size={16} /> Обновить
                </button>
              </div>
              {expiresAt ? (
                <p className="presence-muted">
                  Действует до{' '}
                  {new Date(expiresAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
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

      {fullscreen && url ? (
        <div className="presence-fs" role="dialog" aria-label="QR на весь экран">
          <button type="button" className="presence-fs-close" onClick={() => setFullscreen(false)}>
            Закрыть
          </button>
          <QRCodeDisplay value={url} size={320} />
          <p>Покажите сотруднику на ресепшен</p>
        </div>
      ) : null}
    </section>
  );
}

function ScoreRing({
  title,
  icon,
  value,
  level,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  value: number;
  level?: Scores['mLevel'] | null;
  tone: 'm' | 'eco';
}) {
  const pct = Math.round((level?.progress ?? 0) * 100);
  return (
    <div className={`score-ring score-ring-${tone}`}>
      <div className="score-ring-top">
        {icon}
        <strong>{title}</strong>
      </div>
      <div className="score-ring-value">{value}</div>
      <div className="score-ring-bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="score-ring-meta">
        {level?.label || 'Новичок'}
        {level?.nextLabel ? ` · до «${level.nextLabel}» ещё ${level.toNext}` : ' · максимум'}
      </p>
    </div>
  );
}
