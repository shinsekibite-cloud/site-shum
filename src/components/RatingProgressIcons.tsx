'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Gift, Leaf, Shield, Users, Zap } from 'lucide-react';
import { LEVEL_BANDS, RATING_METER_COPY, type LevelBandId } from '@/lib/profile-level';

export type RatingKind = 'LEVEL' | 'AUTHORITY' | 'SOCIAL' | 'ECO';

export type RatingItem = {
  kind: RatingKind;
  label: string;
  value: string;
  hint?: string;
  progress: number;
  color: string;
};

const META: Record<
  RatingKind,
  { Icon: typeof Zap; short: string; chipLabel: string; defaultColor: string }
> = {
  LEVEL: {
    Icon: Zap,
    short: 'Ур',
    chipLabel: RATING_METER_COPY.LEVEL.label,
    defaultColor: RATING_METER_COPY.LEVEL.color,
  },
  AUTHORITY: {
    Icon: Shield,
    short: 'Н',
    chipLabel: RATING_METER_COPY.AUTHORITY.label,
    defaultColor: RATING_METER_COPY.AUTHORITY.color,
  },
  SOCIAL: {
    Icon: Users,
    short: 'С',
    chipLabel: RATING_METER_COPY.SOCIAL.label,
    defaultColor: RATING_METER_COPY.SOCIAL.color,
  },
  ECO: {
    Icon: Leaf,
    short: 'мб',
    chipLabel: 'мб',
    defaultColor: RATING_METER_COPY.ECO.color,
  },
};

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function ProgressRing({
  progress,
  color,
  size,
  children,
}: {
  progress: number;
  color: string;
  size: number;
  children: ReactNode;
}) {
  const pct = clampPct(progress);
  const stroke = Math.max(2.2, size * 0.1);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <span
      className="rating-ring"
      style={
        {
          width: size,
          height: size,
          ['--ring-color' as string]: color,
        } as CSSProperties
      }
      aria-hidden
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rating-ring__svg">
        <circle
          className="rating-ring__track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="rating-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="rating-ring__icon">{children}</span>
    </span>
  );
}

type IconsProps = {
  items: RatingItem[];
  size?: 'sm' | 'md' | 'lg';
  layout?: 'row' | 'grid';
  onSelect?: (kind: RatingKind) => void;
  className?: string;
};

export default function RatingProgressIcons({
  items,
  size = 'md',
  layout = 'grid',
  onSelect,
  className = '',
}: IconsProps) {
  const ringSize = size === 'sm' ? 32 : size === 'lg' ? 46 : 40;
  const iconPx = size === 'sm' ? 12 : size === 'lg' ? 17 : 15;

  return (
    <div
      className={`rating-icons rating-icons--${layout} rating-icons--${size}${className ? ` ${className}` : ''}`}
      aria-label="Рейтинги и прогресс"
    >
      {items.map((item) => {
        const meta = META[item.kind];
        const Icon = meta.Icon;
        const color = item.color || meta.defaultColor;
        const pct = clampPct(item.progress);
        const interactive = Boolean(onSelect);
        const Tag = interactive ? 'button' : 'div';

        return (
          <Tag
            key={item.kind}
            type={interactive ? 'button' : undefined}
            className={`rating-icons__item${interactive ? ' is-clickable' : ''}`}
            style={{ ['--stat-accent' as string]: color } as CSSProperties}
            aria-label={`${item.label} ${item.value}, прогресс ${pct}%`}
            onClick={interactive ? () => onSelect?.(item.kind) : undefined}
          >
            <ProgressRing progress={pct} color={color} size={ringSize}>
              <Icon size={iconPx} strokeWidth={2.4} />
            </ProgressRing>
            <span className="rating-icons__meta">
              <span className="rating-icons__label">{item.label}</span>
              <span className="rating-icons__value">{item.value}</span>
              {item.hint ? <span className="rating-icons__hint">{item.hint}</span> : null}
              <span className="rating-icons__bar" aria-hidden>
                <span className="rating-icons__bar-fill" style={{ width: `${pct}%` }} />
              </span>
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

/** Компактные чипы — меню / узкие места */
export function RatingProgressChips({
  items,
  onSelect,
  className = '',
}: {
  items: RatingItem[];
  onSelect?: (kind: RatingKind) => void;
  className?: string;
}) {
  return (
    <div className={`rating-chips${className ? ` ${className}` : ''}`} aria-label="Рейтинги">
      {items.map((item) => {
        const meta = META[item.kind];
        const Icon = meta.Icon;
        const color = item.color || meta.defaultColor;
        const pct = clampPct(item.progress);
        const interactive = Boolean(onSelect);
        const Tag = interactive ? 'button' : 'div';
        const chipValue =
          item.kind === 'LEVEL' ? String(item.value).replace(/^Ур\.?\s*/i, '') : item.value;

        return (
          <Tag
            key={item.kind}
            type={interactive ? 'button' : undefined}
            className={`rating-chip${interactive ? ' is-clickable' : ''}`}
            style={{ ['--stat-accent' as string]: color } as CSSProperties}
            aria-label={`${item.label} ${item.value}, прогресс ${pct}%`}
            onClick={interactive ? () => onSelect?.(item.kind) : undefined}
          >
            <ProgressRing progress={pct} color={color} size={26}>
              <Icon size={11} strokeWidth={2.4} />
            </ProgressRing>
            <span className="rating-chip__text">
              <small>{meta.chipLabel}</small>
              <strong>{chipValue}</strong>
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

const WAVE_BAND_ORDER: LevelBandId[] = ['shore', 'bay', 'horizon', 'summit'];

/** Игровой HUD профиля: ранг + волна зон + полоса вклада + награда + метры */
export type PlayerHudProps = {
  level: number;
  title: string;
  blurb?: string;
  color: string;
  pct: number;
  bandTitle?: string;
  bandId?: LevelBandId | string | null;
  toNext?: number | null;
  contribution?: number;
  nextReward?: { level: number; title: string; eco: number; perk: string } | null;
  prestige?: {
    star: number;
    seasonTitle: string;
    perk: string;
    pct: number;
    toNext: number;
    ecoReward: number;
  } | null;
  authority?: number | null;
  authorityLabel?: string;
  social?: number;
  ecoPoints?: number;
  onSelect?: (kind: RatingKind) => void;
  showRatings?: boolean;
  showEco?: boolean;
  className?: string;
};

export function PlayerProgressPanel({
  level,
  title,
  blurb,
  color,
  pct,
  bandTitle,
  bandId,
  toNext,
  nextReward,
  prestige = null,
  authority = null,
  authorityLabel,
  social = 50,
  ecoPoints = 0,
  onSelect,
  showRatings = true,
  showEco = true,
  className = '',
}: PlayerHudProps) {
  const meters: {
    kind: RatingKind;
    label: string;
    value: string;
    progress: number;
    color: string;
    tip: string;
  }[] = [];

  if (showRatings) {
    meters.push(
      {
        kind: 'AUTHORITY',
        label: RATING_METER_COPY.AUTHORITY.short,
        value: authority == null ? '—' : authorityLabel || `${authority}%`,
        progress: authority == null ? 0 : authority,
        color: RATING_METER_COPY.AUTHORITY.color,
        tip:
          authority == null
            ? 'Надёжность появится после первого посещения мероприятия'
            : authorityLabel || RATING_METER_COPY.AUTHORITY.tip,
      },
      {
        kind: 'SOCIAL',
        label: RATING_METER_COPY.SOCIAL.short,
        value: `${social}%`,
        progress: social,
        color: RATING_METER_COPY.SOCIAL.color,
        tip: RATING_METER_COPY.SOCIAL.tip,
      }
    );
  }
  if (showEco) {
    /* Wallet fullness toward a shop-friendly milestone (not fake /200). */
    const ecoTarget = ecoPoints < 50 ? 50 : ecoPoints < 150 ? 150 : ecoPoints < 400 ? 400 : 800;
    meters.push({
      kind: 'ECO',
      label: RATING_METER_COPY.ECO.short,
      value: ecoPoints.toLocaleString('ru-RU'),
      progress: Math.min(100, Math.round((ecoPoints / ecoTarget) * 100)),
      color: RATING_METER_COPY.ECO.color,
      tip: RATING_METER_COPY.ECO.tip,
    });
  }

  const fill = clampPct(pct);
  const atMax = !(toNext != null && toNext > 0) && (fill >= 100 || level >= 10);
  const activeBand = (bandId && bandId in LEVEL_BANDS ? bandId : 'shore') as LevelBandId;
  const activeBandIdx = WAVE_BAND_ORDER.indexOf(
    activeBand === 'prestige' ? 'summit' : activeBand
  );

  return (
    <div
      className={`player-hud${className ? ` ${className}` : ''}`}
      style={{ ['--hud-accent' as string]: color } as CSSProperties}
      aria-label="Игровая прогрессия профиля"
    >
      <button
        type="button"
        className="player-hud__rank"
        onClick={() => onSelect?.('LEVEL')}
        aria-label={`Уровень ${level} ${title}, прогресс ${fill}%`}
      >
        <span className="player-hud__badge" aria-hidden>
          <span className="player-hud__badge-glow" />
          <strong>{level}</strong>
          <Zap size={12} className="player-hud__badge-bolt" />
        </span>
        <span className="player-hud__rank-meta">
          <span className="player-hud__band">{bandTitle || 'Волна Сочи'}</span>
          <span className="player-hud__title">{title}</span>
          {blurb ? <span className="player-hud__blurb">{blurb}</span> : null}
        </span>
      </button>

      <ol className="player-hud__wave" aria-label="Зоны Волны Сочи">
        {WAVE_BAND_ORDER.map((id, idx) => {
          const band = LEVEL_BANDS[id];
          const state =
            idx < activeBandIdx ? 'is-done' : idx === activeBandIdx ? 'is-now' : 'is-next';
          return (
            <li
              key={id}
              className={`player-hud__wave-node ${state}`}
              style={{ ['--band' as string]: band.color } as CSSProperties}
              title={band.tagline}
            >
              <i aria-hidden />
              <span>{band.title}</span>
            </li>
          );
        })}
      </ol>

      <div className="player-hud__xp" aria-hidden={false}>
        <div className="player-hud__xp-top">
          <span>{atMax ? 'Ранг максимальный' : 'Вклад до следующего ранга'}</span>
          <span>
            {toNext != null && toNext > 0 ? `ещё ${toNext}` : atMax ? '10/10' : `${fill}%`}
          </span>
        </div>
        <div className="player-hud__xp-track" role="progressbar" aria-valuenow={fill} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${fill}%` }} />
          <span className="player-hud__xp-shine" />
        </div>
      </div>

      {nextReward && toNext != null && toNext > 0 ? (
        <button
          type="button"
          className="player-hud__loot"
          onClick={() => onSelect?.('LEVEL')}
        >
          <Gift size={14} aria-hidden />
          <span>
            Награда ур. {nextReward.level}: <b>+{nextReward.eco} мб</b>
            <em> · {nextReward.perk}</em>
          </span>
        </button>
      ) : null}

      {prestige ? (
        <button type="button" className="player-hud__prestige" onClick={() => onSelect?.('LEVEL')}>
          <span className="player-hud__prestige-top">
            <strong>★{prestige.star}</strong>
            <span>{prestige.seasonTitle}</span>
            <em>ещё {prestige.toNext}</em>
          </span>
          <span className="player-hud__prestige-track" aria-hidden>
            <i style={{ width: `${clampPct(prestige.pct)}%` }} />
          </span>
          <span className="player-hud__prestige-perk">
            {prestige.perk} · награда ≈ +{prestige.ecoReward} мб
          </span>
        </button>
      ) : null}

      {meters.length ? (
        <div className="player-hud__meters">
          {meters.map((m) => {
            const Icon =
              m.kind === 'AUTHORITY' ? Shield : m.kind === 'SOCIAL' ? Users : Leaf;
            return (
              <button
                key={m.kind}
                type="button"
                className="player-hud__meter"
                style={{ ['--stat-accent' as string]: m.color } as CSSProperties}
                title={m.tip}
                aria-label={`${m.label} ${m.value}`}
                onClick={() => onSelect?.(m.kind)}
              >
                <ProgressRing progress={m.progress} color={m.color} size={28}>
                  <Icon size={12} strokeWidth={2.5} />
                </ProgressRing>
                <span className="player-hud__meter-text">
                  <small>{m.label}</small>
                  <strong>{m.value}</strong>
                </span>
                <span className="player-hud__meter-bar" aria-hidden>
                  <i style={{ width: `${clampPct(m.progress)}%` }} />
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Публичный профиль / широкая полоса */
export function ProfileRatingsStrip({
  items,
  onSelect,
  className = '',
}: {
  items: RatingItem[];
  onSelect?: (kind: RatingKind) => void;
  className?: string;
}) {
  return (
    <div className={`profile-ratings${className ? ` ${className}` : ''}`} aria-label="Рейтинги и прогресс">
      {items.map((item) => {
        const meta = META[item.kind];
        const Icon = meta.Icon;
        const color = item.color || meta.defaultColor;
        const pct = clampPct(item.progress);
        const interactive = Boolean(onSelect);
        const Tag = interactive ? 'button' : 'div';
        const value =
          item.kind === 'LEVEL'
            ? String(item.value).replace(/^Ур\.?\s*/i, '')
            : item.kind === 'ECO' && /^\d+$/.test(String(item.value))
              ? Number(item.value) >= 1000
                ? `${Math.round(Number(item.value) / 100) / 10}k`.replace('.0k', 'k')
                : String(item.value)
              : item.value;
        const shortLabel = meta.chipLabel;

        return (
          <Tag
            key={item.kind}
            type={interactive ? 'button' : undefined}
            className={`profile-ratings__card${interactive ? ' is-clickable' : ''}`}
            style={{ ['--stat-accent' as string]: color } as CSSProperties}
            aria-label={`${item.label} ${item.value}, прогресс ${pct}%`}
            onClick={interactive ? () => onSelect?.(item.kind) : undefined}
          >
            <span className="profile-ratings__icon" aria-hidden>
              <ProgressRing progress={pct} color={color} size={26}>
                <Icon size={11} strokeWidth={2.45} />
              </ProgressRing>
            </span>
            <strong className="profile-ratings__value">{value}</strong>
            <span className="profile-ratings__label">{shortLabel}</span>
            <span className="profile-ratings__bar" aria-hidden>
              <span style={{ width: `${pct}%` }} />
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

export function buildRatingItems(opts: {
  level?: number;
  levelTitle?: string;
  levelColor?: string;
  levelPct?: number;
  authority?: number;
  social?: number;
  ecoPoints?: number;
  ecoPct?: number;
}): RatingItem[] {
  const authority = opts.authority ?? 100;
  const social = opts.social ?? 50;
  const ecoPoints = opts.ecoPoints ?? 0;
  const level = opts.level ?? 1;

  return [
    {
      kind: 'LEVEL',
      label: RATING_METER_COPY.LEVEL.label,
      value: String(level),
      hint: opts.levelTitle || 'ранг',
      progress: opts.levelPct ?? 0,
      color: opts.levelColor || RATING_METER_COPY.LEVEL.color,
    },
    {
      kind: 'AUTHORITY',
      label: RATING_METER_COPY.AUTHORITY.label,
      value: `${authority}%`,
      hint: RATING_METER_COPY.AUTHORITY.tip,
      progress: authority,
      color: RATING_METER_COPY.AUTHORITY.color,
    },
    {
      kind: 'SOCIAL',
      label: RATING_METER_COPY.SOCIAL.label,
      value: `${social}%`,
      hint: RATING_METER_COPY.SOCIAL.tip,
      progress: social,
      color: RATING_METER_COPY.SOCIAL.color,
    },
    {
      kind: 'ECO',
      label: RATING_METER_COPY.ECO.label,
      value: String(ecoPoints),
      hint: RATING_METER_COPY.ECO.tip,
      progress: opts.ecoPct ?? Math.min(100, Math.round((ecoPoints / 200) * 100)),
      color: RATING_METER_COPY.ECO.color,
    },
  ];
}
