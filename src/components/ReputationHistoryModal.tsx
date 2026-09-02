'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gift, Leaf, Rocket, ShoppingBag, Shield, Users, X, Zap } from 'lucide-react';
import { PROFILE_LEVELS, LEVEL_BANDS, RATING_METER_COPY } from '@/lib/profile-level';
import { ecoReasonRu } from '@/lib/eco-reason-ru';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/body-scroll-lock';

type ReputationKind = 'AUTHORITY' | 'SOCIAL' | 'ECO';

type HistoryEvent = {
  id: string;
  kind: ReputationKind;
  delta: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
};

type ReputationData = {
  authority: number;
  social: number;
  ecoPoints: number;
  authorityLabel?: string;
  socialLabel?: string;
  attendedCount?: number;
  noShowCount?: number;
  cosmetics?: string[];
  history: Record<ReputationKind, HistoryEvent[]>;
};

type TabId = 'LEVEL' | 'AUTHORITY' | 'SOCIAL' | 'ECO';

const TAB_META: Record<TabId, { label: string; Icon: typeof Zap; blurb: string }> = {
  LEVEL: {
    label: 'Уровень',
    Icon: Zap,
    blurb: RATING_METER_COPY.LEVEL.tip,
  },
  AUTHORITY: {
    label: RATING_METER_COPY.AUTHORITY.label,
    Icon: Shield,
    blurb: RATING_METER_COPY.AUTHORITY.tip,
  },
  SOCIAL: {
    label: RATING_METER_COPY.SOCIAL.label,
    Icon: Users,
    blurb: RATING_METER_COPY.SOCIAL.tip,
  },
  ECO: {
    label: 'мб',
    Icon: Leaf,
    blurb: RATING_METER_COPY.ECO.tip,
  },
};

function formatDelta(delta: number, kind: TabId) {
  if (kind === 'ECO' || kind === 'LEVEL') {
    return delta > 0 ? `+${delta}` : String(delta);
  }
  return delta > 0 ? `+${delta}%` : `${delta}%`;
}

function humanReason(reason: string) {
  return ecoReasonRu(reason);
}

type LevelInfo = {
  level: {
    level: number;
    title: string;
    blurb: string;
    color: string;
    next?: number;
    reward?: { eco: number; perk: string };
    band?: string;
  };
  pct: number;
  contribution: number;
  toNext?: number;
  band?: { title: string; tagline: string };
  nextReward?: { level: number; title: string; eco: number; perk: string } | null;
  roadmap?: {
    level: number;
    title: string;
    min: number;
    color: string;
    band: string;
    reward: { eco: number; perk: string };
    reached: boolean;
    current: boolean;
  }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  initialTab?: TabId;
  onOpenShop?: () => void;
  onEcoChange?: (eco: number) => void;
};

export default function ReputationHistoryModal({
  open,
  onClose,
  initialTab = 'AUTHORITY',
  onOpenShop,
}: Props) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [data, setData] = useState<ReputationData | null>(null);
  const [level, setLevel] = useState<LevelInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setLoading(true);
    Promise.all([
      fetch('/api/user/reputation').then((r) => r.json()),
      fetch('/api/user/eco').then((r) => r.json()),
    ])
      .then(([rep, eco]) => {
        if (typeof rep.authority === 'number') setData(rep);
        if (eco?.level) setLevel(eco.level);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      unlockBodyScroll();
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const balance =
    tab === 'LEVEL'
      ? level
        ? `Ур. ${level.level.level} · ${level.level.title}`
        : '…'
      : tab === 'AUTHORITY'
        ? `${data?.authority ?? '—'}%`
        : tab === 'SOCIAL'
          ? `${data?.social ?? '—'}%`
          : String(data?.ecoPoints ?? '—');

  const events =
    tab === 'LEVEL' || tab === 'ECO'
      ? data?.history?.ECO || []
      : data?.history?.[tab] || [];

  const roadmap = level?.roadmap || PROFILE_LEVELS.map((l) => ({
    level: l.level,
    title: l.title,
    min: l.min,
    color: l.color,
    band: l.band,
    reward: l.reward,
    reached: false,
    current: false,
  }));

  return createPortal(
    <div className="rep-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="rep-modal rep-modal--wide rep-modal--game"
        role="dialog"
        aria-modal="true"
        aria-label="Рейтинги, уровень и история"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rep-modal__head">
          <strong>Прогрессия и рейтинги</strong>
          <button type="button" className="yp-modal-close" aria-label="Закрыть" onClick={onClose}>
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <p className="rep-modal__why">
          <b>Уровень</b> — ваш вклад на портале (эко + стиль + коллекция).{' '}
          <b>Надёжность</b> — можно ли доверять вам на событиях;{' '}
          <b>Сообщество</b> — насколько вы в теме общения. Эко — валюта стиля и карт.
        </p>

        <div className="rep-modal__tabs" role="tablist">
          {(Object.keys(TAB_META) as TabId[]).map((id) => {
            const meta = TAB_META[id];
            const Icon = meta.Icon;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`rep-modal__tab${tab === id ? ' is-active' : ''}`}
                onClick={() => setTab(id)}
              >
                <Icon size={14} aria-hidden />
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="rep-modal__balance">
          <span className="rep-modal__balance-val">{loading ? '…' : balance}</span>
          <span className="rep-modal__balance-hint">
            {tab === 'LEVEL' && level
              ? `${level.band?.title || ''} · ${level.level.blurb}${
                  level.toNext ? ` · до следующего: ${level.toNext}` : ' · максимум'
                }`
              : tab === 'AUTHORITY' && data
                ? `${data.authorityLabel || 'Надёжность'} · пришёл: ${data.attendedCount ?? 0}, пропусков: ${data.noShowCount ?? 0}`
                : tab === 'SOCIAL' && data
                  ? `${data.socialLabel || 'Сообщество'} · ${TAB_META.SOCIAL.blurb}`
                  : TAB_META.ECO.blurb}
          </span>
          {tab === 'LEVEL' && level?.level.next ? (
            <div className="rep-modal__level-bar" aria-hidden>
              <i style={{ width: `${level.pct}%`, background: level.level.color }} />
            </div>
          ) : null}
        </div>

        {tab === 'LEVEL' ? (
          <div className="rep-modal__roadmap" aria-label="Карта уровней">
            <div className="rep-modal__roadmap-head">
              <Rocket size={14} /> Карта волны · награды за ранги
            </div>
            <ol className="rep-modal__roadmap-list">
              {roadmap.map((row) => {
                const band = LEVEL_BANDS[row.band as keyof typeof LEVEL_BANDS];
                return (
                  <li
                    key={row.level}
                    className={`rep-modal__roadmap-item${row.reached ? ' is-reached' : ''}${
                      row.current ? ' is-current' : ''
                    }`}
                    style={{ ['--lvl-color' as string]: row.color }}
                  >
                    <span className="rep-modal__roadmap-lvl">{row.level}</span>
                    <span className="rep-modal__roadmap-body">
                      <strong>{row.title}</strong>
                      <small>
                        {band?.title} · вклад от {row.min}
                        {row.reward.eco > 0 ? ` · +${row.reward.eco} эко` : ''}
                      </small>
                      <em>{row.reward.perk}</em>
                    </span>
                    {row.current ? <Gift size={14} className="rep-modal__roadmap-gift" /> : null}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {(tab === 'ECO' || tab === 'LEVEL') && (
          <div className="rep-modal__actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onOpenShop?.();
                onClose();
              }}
            >
              <ShoppingBag size={15} /> Эко-магазин и карты
            </button>
          </div>
        )}

        <div className="rep-modal__list" aria-live="polite">
          {loading ? (
            <p className="rep-modal__empty">Загрузка…</p>
          ) : events.length === 0 ? (
            <p className="rep-modal__empty">
              {tab === 'LEVEL'
                ? 'История вклада пока пуста — зарабатывайте эко, оформляйте профиль и открывайте карты.'
                : 'Пока нет записей в этой категории'}
            </p>
          ) : (
            <ul>
              {events.map((e) => (
                <li key={e.id} className="rep-modal__event">
                  <div className="rep-modal__event-top">
                    <span className={`rep-modal__delta${e.delta >= 0 ? ' is-plus' : ' is-minus'}`}>
                      {formatDelta(e.delta, tab === 'LEVEL' ? 'ECO' : tab)}
                    </span>
                    <time dateTime={e.createdAt}>
                      {new Date(e.createdAt).toLocaleString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Europe/Moscow',
                      })}
                    </time>
                  </div>
                  <div className="rep-modal__reason">{humanReason(e.reason)}</div>
                  <div className="rep-modal__after">
                    Баланс: {tab === 'AUTHORITY' || tab === 'SOCIAL' ? `${e.balanceAfter}%` : e.balanceAfter}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
