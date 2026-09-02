'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  Camera,
  Check,
  Compass,
  Crown,
  Eye,
  Flame,
  Gamepad2,
  Handshake,
  Heart,
  LayoutGrid,
  Leaf,
  MapPin,
  Medal,
  MessageCircle,
  Puzzle,
  QrCode,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Target,
  Ticket,
  Users,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ACHIEVEMENTS,
  TIER_META,
  type AchievementDef,
} from '@/lib/achievements';
import {
  SHOWCASE_MAX,
  parseShowcaseBadges,
  resolveShowcaseCodes,
  type UnlockedShowcase,
} from '@/lib/showcase-badges';
import { invalidateProfileCache } from '@/lib/user-data-client';

type AchItem = AchievementDef & { unlocked?: boolean; unlockedAt?: string | null };

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

function BadgeIcon({ def, size = 16 }: { def: AchievementDef; size?: number }) {
  const Icon = ICONS[def.icon as keyof typeof ICONS] || Award;
  return <Icon size={size} aria-hidden style={{ color: 'inherit' }} />;
}

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      res.status === 401
        ? 'Войдите снова'
        : res.status >= 500
          ? 'Сервер временно недоступен'
          : 'Ответ сервера повреждён'
    );
  }
}

type Props = {
  showcaseStored?: string | null | string[];
  onSaved?: (codes: string[]) => void;
};

export default function ShowcaseStudio({ showcaseStored, onSaved }: Props) {
  const [items, setItems] = useState<AchItem[]>([]);
  const [codes, setCodes] = useState<string[]>(() => parseShowcaseBadges(showcaseStored));
  const [draft, setDraft] = useState<string[]>(() => parseShowcaseBadges(showcaseStored));
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/achievements?lite=1', { cache: 'no-store' });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String(data.message || data.error || 'Не удалось загрузить'));
      const list = Array.isArray(data.items) ? (data.items as AchItem[]) : [];
      const unlocked = list.filter((i) => i.unlocked);
      setItems(unlocked);
      const unlockedMeta: UnlockedShowcase[] = unlocked.map((i) => ({
        code: i.code,
        unlockedAt: i.unlockedAt || null,
      }));
      const hasStored =
        showcaseStored !== null &&
        showcaseStored !== undefined &&
        !(typeof showcaseStored === 'string' && !showcaseStored.trim());
      const stored = hasStored ? parseShowcaseBadges(showcaseStored) : null;
      const next = resolveShowcaseCodes(stored, unlockedMeta);
      setCodes(next);
      setDraft(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка загрузки');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [showcaseStored]);

  useEffect(() => {
    void load();
  }, [load]);

  const unlockedMeta = useMemo(
    () => items.map((i) => ({ code: i.code, unlockedAt: i.unlockedAt || null })),
    [items]
  );

  const activeCodes = editing ? draft : codes;
  const defs = useMemo(
    () =>
      activeCodes
        .map((c) => items.find((i) => i.code === c) || ACHIEVEMENTS.find((a) => a.code === c))
        .filter(Boolean) as AchievementDef[],
    [activeCodes, items]
  );

  const saveDraft = async () => {
    setSaving(true);
    try {
      const cleaned = Array.from(
        new Set(draft.filter((c) => unlockedMeta.some((u) => u.code === c)))
      ).slice(0, SHOWCASE_MAX);
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showcaseBadges: cleaned }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String(data.message || 'Не удалось сохранить'));
      const user = data.user as { showcaseBadges?: unknown } | undefined;
      const saved = parseShowcaseBadges(user?.showcaseBadges ?? cleaned);
      setCodes(saved);
      setDraft(saved);
      setEditing(false);
      invalidateProfileCache();
      onSaved?.(saved);
      toast.success(saved.length ? 'Витрина обновлена' : 'Значки сняты');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="showcase-studio" aria-label="Витрина значков">
      <header className="showcase-studio__head">
        <div>
          <h3 className="showcase-studio__title">
            <LayoutGrid size={18} aria-hidden /> Значки профиля
          </h3>
          <p className="showcase-studio__lead">
            До {SHOWCASE_MAX} значков на публичной странице — медали вашей карточки игрока.
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setDraft([...codes]);
              setEditing(true);
            }}
            disabled={loading}
          >
            {defs.length ? 'Изменить' : 'Собрать витрину'}
          </button>
        ) : (
          <div className="showcase-studio__actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setDraft([...codes]);
                setEditing(false);
              }}
              disabled={saving}
            >
              Отмена
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveDraft()} disabled={saving}>
              {saving ? '…' : 'Сохранить'}
            </button>
          </div>
        )}
      </header>

      <div className="showcase-studio__meta">
        <span>
          Выбрано: <strong>{activeCodes.length}</strong> / {SHOWCASE_MAX}
        </span>
        <Link href="/dashboard/achievements" className="showcase-studio__link">
          Все достижения →
        </Link>
      </div>

      {!editing ? (
        <div className="showcase-studio__stage">
          {loading ? (
            <p className="showcase-studio__empty">Загрузка…</p>
          ) : defs.length ? (
            defs.map((def) => (
              <article
                key={def.code}
                className="showcase-badge-card"
                style={{ ['--badge-accent' as string]: def.accent }}
              >
                <span className="showcase-badge-card__icon">
                  <BadgeIcon def={def} size={22} />
                </span>
                <div>
                  <strong>{def.title}</strong>
                  <small>{TIER_META[def.tier]?.label || def.tier}</small>
                </div>
              </article>
            ))
          ) : (
            <p className="showcase-studio__empty">
              {items.length
                ? 'Витрина пуста — нажмите «Собрать витрину».'
                : 'Сначала откройте достижения, затем вернитесь сюда.'}
            </p>
          )}
        </div>
      ) : (
        <div className="showcase-studio__pick" role="listbox" aria-multiselectable="true">
          {items.map((item) => {
            const active = draft.includes(item.code);
            const blocked = !active && draft.length >= SHOWCASE_MAX;
            return (
              <button
                key={item.code}
                type="button"
                role="option"
                aria-selected={active}
                disabled={blocked && !active}
                className={`showcase-pick-card${active ? ' is-on' : ''}${blocked ? ' is-blocked' : ''}`}
                style={{ ['--badge-accent' as string]: item.accent }}
                onClick={() => {
                  setDraft((prev) => {
                    if (prev.includes(item.code)) return prev.filter((c) => c !== item.code);
                    if (prev.length >= SHOWCASE_MAX) {
                      toast.error(`Можно выбрать не больше ${SHOWCASE_MAX}`);
                      return prev;
                    }
                    return [...prev, item.code];
                  });
                }}
              >
                <span className="showcase-pick-card__icon">
                  <BadgeIcon def={item} size={18} />
                </span>
                <span className="showcase-pick-card__text">
                  <strong>{item.title}</strong>
                  <small>{TIER_META[item.tier]?.label || item.tier}</small>
                </span>
                {active ? (
                  <span className="showcase-pick-card__check" aria-hidden>
                    <Check size={14} strokeWidth={2.8} />
                  </span>
                ) : null}
              </button>
            );
          })}
          {!items.length ? (
            <p className="showcase-studio__empty">Нет открытых значков. Загляните в достижения.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
