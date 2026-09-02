'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Award,
  Building2,
  CalendarCheck,
  Camera,
  Check,
  ChevronDown,
  Compass,
  Crown,
  Flame,
  Heart,
  Lock,
  MapPin,
  Medal,
  MessageCircle,
  QrCode,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Star,
  Ticket,
  Users,
  Zap,
  Eye,
  Gamepad2,
  Puzzle,
  Target,
  BookOpen,
  BadgeCheck,
  Briefcase,
  Leaf,
  Handshake,
} from 'lucide-react';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  TIER_META,
  groupByAchievementCategory,
  type AchievementCategory,
  type AchievementTier,
} from '@/lib/achievements';

const ICONS = {
  Sparkles,
  Ticket,
  QrCode,
  Shield,
  Users,
  Flame,
  Star,
  Heart,
  MapPin,
  Award,
  Zap,
  Crown,
  MessageCircle,
  Camera,
  Compass,
  CalendarCheck,
  Building2,
  Medal,
  Rocket,
  Eye,
  Gamepad2,
  Puzzle,
  Target,
  BookOpen,
  BadgeCheck,
  Briefcase,
  Leaf,
  Handshake,
} as const;

type ItemProgress = {
  current: number;
  target: number;
  percent: number;
  label: string;
};

type Item = {
  code: string;
  title: string;
  description: string;
  tier: AchievementTier;
  category?: AchievementCategory;
  icon: keyof typeof ICONS;
  accent: string;
  unlocked: boolean;
  unlockedAt?: string | null;
  step?: ItemProgress;
};

type Progress = {
  unlocked: number;
  total: number;
  percent: number;
  complete: boolean;
  bronze: { done: number; total: number; percent: number };
  silver: { done: number; total: number; percent: number };
  gold: { done: number; total: number; percent: number };
};

type Props = {
  compact?: boolean;
  onProgress?: (p: Progress & { legend: boolean }) => void;
};

type StatusFilter = AchievementTier | 'all' | 'open' | 'locked';

function RowStatus({
  step,
  accent,
  unlocked,
}: {
  step?: ItemProgress;
  accent: string;
  unlocked: boolean;
}) {
  if (unlocked) {
    return (
      <span className="ach-row__badge is-done" style={{ color: accent, background: `${accent}18` }}>
        <Check size={11} strokeWidth={3} />
      </span>
    );
  }
  if (!step || step.target <= 1) {
    return (
      <span className="ach-row__badge is-locked">
        <Lock size={10} />
      </span>
    );
  }
  return (
    <span className="ach-row__badge is-progress" title={step.label}>
      {step.current}/{step.target}
    </span>
  );
}

export default function AchievementsPanel({ compact, onProgress }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [legend, setLegend] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('locked');
  const [categoryFilter, setCategoryFilter] = useState<AchievementCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    fetch('/api/user/achievements')
      .then(async (r) => {
        const raw = await r.text();
        try { return raw ? JSON.parse(raw) : null; } catch { return null; }
      })
      .then((data) => {
        if (Array.isArray(data.items)) setItems(data.items);
        if (data.progress) {
          setProgress(data.progress);
          setLegend(Boolean(data.legend));
          onProgressRef.current?.({ ...data.progress, legend: Boolean(data.legend) });
          const locked = (data.items as Item[]).some((i) => !i.unlocked);
          if (!locked) setStatusFilter('open');
        }
      })
      .catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => {
        if (statusFilter === 'open') {
          if (!i.unlocked) return false;
        } else if (statusFilter === 'locked') {
          if (i.unlocked) return false;
        } else if (statusFilter === 'all') {
          /* keep */
        } else if (i.tier !== statusFilter) {
          return false;
        }
        if (categoryFilter !== 'all' && (i.category || 'profile') !== categoryFilter) {
          return false;
        }
        if (!q) return true;
        return (
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
        return TIER_META[b.tier].order - TIER_META[a.tier].order;
      });
  }, [items, statusFilter, categoryFilter, query]);

  const groups = useMemo(() => groupByAchievementCategory(filtered), [filtered]);

  const categoryCounts = useMemo(() => {
    const map = new Map<AchievementCategory, { total: number; unlocked: number }>();
    for (const item of items) {
      const cat = item.category || 'profile';
      const cur = map.get(cat) || { total: 0, unlocked: 0 };
      cur.total += 1;
      if (item.unlocked) cur.unlocked += 1;
      map.set(cat, cur);
    }
    return map;
  }, [items]);

  if (!items.length || !progress) return null;

  const statusFilters: Array<{ id: StatusFilter; label: string; activeStyle?: CSSProperties }> = [
    { id: 'locked', label: `В работе ${progress.total - progress.unlocked}` },
    { id: 'open', label: `Есть ${progress.unlocked}` },
    {
      id: 'all',
      label: `Все ${progress.unlocked}/${progress.total}`,
      activeStyle: { background: 'rgba(15,23,42,0.9)', color: '#fff', borderColor: 'rgba(15,23,42,0.55)' },
    },
    ...(['bronze', 'silver', 'gold'] as AchievementTier[]).map((t) => ({
      id: t as StatusFilter,
      label: `${TIER_META[t].label.slice(0, 1)} ${progress[t].done}/${progress[t].total}`,
      activeStyle: {
        background: TIER_META[t].bg,
        color: TIER_META[t].color,
        borderColor: TIER_META[t].color,
      },
    })),
  ];

  const summary = (
    <div className="ach-summary-block">
      <div className="ach-summary">
        <div
          className={`ach-summary__ring${progress.complete ? ' achievement-complete-ring' : ''}`}
          style={{
            background: `conic-gradient(${progress.complete ? '#ca8a04' : 'var(--primary)'} ${progress.percent}%, rgba(15,23,42,0.08) 0)`,
          }}
          aria-label={`Прогресс ${progress.percent}%`}
        >
          <div className="ach-summary__ring-inner">
            <strong>{progress.percent}%</strong>
            <span>
              {progress.unlocked}/{progress.total}
            </span>
          </div>
        </div>
        <div className="ach-summary__text">
          <div className="ach-summary__title">
            {progress.complete ? 'Коллекция собрана' : 'Ваш прогресс'}
          </div>
          <p>
            {progress.complete
              ? 'Золотая рамка профиля открыта.'
              : 'Собирайте достижения по разделам — прогресс виден в фильтрах ниже.'}
          </p>
        </div>
      </div>
      <div className="ach-summary__track" aria-hidden>
        <i style={{ width: `${Math.min(100, progress.percent)}%` }} />
      </div>
      <div className="ach-tier-bars" aria-label="Прогресс по уровням">
        {(
          [
            { key: 'bronze' as const, label: 'Бронза' },
            { key: 'silver' as const, label: 'Серебро' },
            { key: 'gold' as const, label: 'Золото' },
          ] as const
        ).map(({ key, label }) => {
          const t = progress[key];
          const meta = TIER_META[key];
          return (
            <div key={key} className="ach-tier-bars__item">
              <div className="ach-tier-bars__head">
                <span style={{ color: meta.color }}>
                  {label}
                  <em style={{ fontStyle: 'normal', fontWeight: 600, opacity: 0.75, marginLeft: 6 }}>
                    +{meta.ecoReward} мб
                  </em>
                </span>
                <span>
                  {t.done}/{t.total}
                </span>
              </div>
              <div className="ach-tier-bars__track">
                <i style={{ width: `${t.percent}%`, background: meta.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (compact) {
    return (
      <div
        className="ach-panel ach-panel--compact"
        style={{
          border: progress.complete ? '1px solid rgba(202,138,4,0.35)' : '1px solid rgba(15,23,42,0.08)',
          background: progress.complete
            ? 'linear-gradient(145deg, rgba(202,138,4,0.12), #fff 50%)'
            : '#f8fafc',
        }}
      >
        {summary}
      </div>
    );
  }

  const renderRow = (item: Item) => {
    const Icon = ICONS[item.icon] || Award;
    const on = item.unlocked;
    const tier = TIER_META[item.tier];
    const showBar = !on && item.step && item.step.target >= 1;
    const isOpen = expanded === item.code;
    return (
      <li
        key={item.code}
        className={`ach-row${on ? ' is-unlocked' : ''}${isOpen ? ' is-open' : ''}`}
        style={{
          borderColor: on ? `${item.accent}40` : 'rgba(15,23,42,0.08)',
          background: on ? `linear-gradient(90deg, ${item.accent}12, #fff 42%)` : '#fff',
        }}
      >
        <button
          type="button"
          className="ach-row__main"
          onClick={() => setExpanded((cur) => (cur === item.code ? null : item.code))}
          aria-expanded={isOpen}
        >
          <span
            className="ach-row__icon"
            style={{
              background: on ? `${item.accent}18` : 'rgba(15,23,42,0.06)',
              color: on ? item.accent : '#94a3b8',
            }}
          >
            <Icon size={15} />
          </span>
          <span className="ach-row__body">
            <span className="ach-row__top">
              <strong>{item.title}</strong>
              <span className="ach-row__meta">
                <span className="ach-row__tier" style={{ background: tier.bg, color: tier.color }}>
                  {tier.label.slice(0, 1)}
                </span>
                <RowStatus step={item.step} accent={item.accent} unlocked={on} />
                <ChevronDown size={14} className={`ach-row__chevron${isOpen ? ' is-open' : ''}`} />
              </span>
            </span>
            {showBar ? (
              <span className="ach-row__bar" aria-hidden>
                <i
                  style={{
                    width: `${Math.min(100, Math.max(item.step!.target <= 1 ? (item.step!.current >= 1 ? 100 : 0) : item.step!.percent, item.step!.current > 0 && item.step!.percent === 0 ? 8 : 0))}%`,
                    background: `linear-gradient(90deg, ${item.accent}99, ${item.accent})`,
                  }}
                />
              </span>
            ) : on ? (
              <span className="ach-row__bar is-done" aria-hidden>
                <i style={{ width: '100%', background: `linear-gradient(90deg, ${item.accent}66, ${item.accent})` }} />
              </span>
            ) : null}
          </span>
        </button>
        {isOpen ? (
          <div className="ach-row__desc">
            <p>{item.description}</p>
            {on && item.unlockedAt ? (
              <time dateTime={String(item.unlockedAt)}>
                Получено{' '}
                {new Date(item.unlockedAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </time>
            ) : !on && item.step ? (
              <span className="ach-row__hint">{item.step.label}</span>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="ach-panel">
      {progress.complete && (
        <div className="achievement-legend-banner ach-legend">
          <div className="ach-legend__icon">
            <Crown size={16} />
          </div>
          <div>
            <div className="ach-legend__title">{legend ? 'Легенда Сочи' : 'Все достижения собраны'}</div>
          </div>
        </div>
      )}

      {summary}

      <div className="ach-toolbar">
        <label className="ach-search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск достижений…"
            aria-label="Поиск достижений"
          />
        </label>
        <div className="ach-filters" role="tablist" aria-label="Статус и уровень">
          {statusFilters.map((f) => {
            const active = statusFilter === f.id;
            const tierMeta =
              f.id === 'bronze' || f.id === 'silver' || f.id === 'gold' ? TIER_META[f.id] : null;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`ach-filters__btn${active ? ' is-active' : ''}`}
                onClick={() => {
                  setStatusFilter(f.id);
                  setExpanded(null);
                }}
                style={
                  active
                    ? f.activeStyle
                    : tierMeta
                      ? { background: tierMeta.bg, color: tierMeta.color }
                      : undefined
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="ach-cat-filters" role="tablist" aria-label="Категории">
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === 'all'}
            className={`ach-cat-filters__btn${categoryFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            Разделы
          </button>
          {CATEGORY_ORDER.map((cat) => {
            const counts = categoryCounts.get(cat);
            if (!counts) return null;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={categoryFilter === cat}
                className={`ach-cat-filters__btn${categoryFilter === cat ? ' is-active' : ''}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {CATEGORY_META[cat].short}
                <em>
                  {counts.unlocked}/{counts.total}
                </em>
              </button>
            );
          })}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="ach-empty">Ничего не найдено — сбросьте поиск или фильтр.</p>
      ) : (
        <div className="ach-groups">
          {groups.map((group) => {
            const collapsed = collapsedCats[group.category] === true;
            const unlockedIn = group.items.filter((i) => i.unlocked).length;
            return (
              <section key={group.category} className="ach-group">
                <button
                  type="button"
                  className="ach-group__head"
                  onClick={() =>
                    setCollapsedCats((prev) => ({
                      ...prev,
                      [group.category]: !collapsed,
                    }))
                  }
                  aria-expanded={!collapsed}
                >
                  <span>
                    <strong>{group.label}</strong>
                    <em>
                      {unlockedIn}/{group.items.length}
                    </em>
                  </span>
                  <ChevronDown size={16} className={collapsed ? '' : 'is-open'} />
                </button>
                {!collapsed ? <ul className="ach-list">{group.items.map(renderRow)}</ul> : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
