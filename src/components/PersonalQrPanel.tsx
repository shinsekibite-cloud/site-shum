'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import { Maximize2, RefreshCw, Leaf, Sparkles } from 'lucide-react';

type Scores = {
  mBall: number;
  ecoBall: number;
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
      const r = await fetch(force ? '/api/presence-qr' : '/api/presence-qr', {
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

  return (
    <section className="presence-panel" aria-label="Личный QR и баллы">
      <div className="presence-grid presence-grid--svc">
        <div className="presence-scores">
          <ScoreRing
            title="М-бал"
            icon={<Sparkles size={18} />}
            value={scores?.mBall ?? 0}
            level={scores?.mLevel}
            tone="m"
          />
          <ScoreRing
            title="Экобал"
            icon={<Leaf size={18} />}
            value={scores?.ecoBall ?? 0}
            level={scores?.ecoLevel}
            tone="eco"
          />
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
                  {h.delta} {h.kind === 'ECO_BALL' ? 'Эко' : 'М'}
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
