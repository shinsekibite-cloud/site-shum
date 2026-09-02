'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  Copy,
  Crown,
  Eye,
  Flame,
  Gamepad2,
  Gauge,
  Handshake,
  Heart,
  Leaf,
  MapPin,
  Medal,
  MessageCircle,
  Pencil,
  Puzzle,
  QrCode,
  Rocket,
  Settings,
  Shield,
  Sparkles,
  Star,
  Target,
  Ticket,
  User,
  UserCircle,
  Users,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useVoice, useVoiceCopy } from '@/components/VoiceProvider';
import {
  ACHIEVEMENTS,
  TIER_META,
  type AchievementDef,
} from '@/lib/achievements';
import { PlayerProgressPanel } from '@/components/RatingProgressIcons';
import { maskEmail, maskPhone } from '@/lib/pii-mask';
import {
  SHOWCASE_MAX,
  parseShowcaseBadges,
  resolveShowcaseCodes,
  type UnlockedShowcase,
} from '@/lib/showcase-badges';
import { shouldShowLegalSub } from '@/lib/profile-display';
import { equippedLoadoutItems, shopFrameStyle } from '@/lib/eco-loadout';

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

type AchItem = AchievementDef & {
  unlocked?: boolean;
  unlockedAt?: string | null;
};

export type ProfileStatKey = 'LEVEL' | 'AUTHORITY' | 'SOCIAL' | 'ECO';

type LevelMeta = {
  level: number;
  title: string;
  color: string;
  pct: number;
  blurb?: string;
  bandTitle?: string;
  bandId?: string;
  toNext?: number | null;
  nextReward?: { level: number; title: string; eco: number; perk: string } | null;
  prestige?: {
    star: number;
    seasonTitle: string;
    perk: string;
    pct: number;
    toNext: number;
    ecoReward: number;
  } | null;
};

type Props = {
  name: string | null | undefined;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
  roleLabel?: string | null;
  image?: string | null;
  publicCode?: string | null;
  bio?: string | null;
  legend?: boolean;
  modernBadge?: boolean;
  showcaseStored?: string | null | string[];
  showcaseHref?: string;
  instructionsVersion?: string | null;
  instructionsCompletedAt?: string | null;
  authority?: number | null;
  authorityLabel?: string;
  social?: number;
  ecoPoints?: number;
  /** Parent-provided level — avoids a second /api/user/eco fetch */
  levelMeta?: LevelMeta | null;
  editHref?: string;
  settingsHref?: string;
  publicHref?: string;
  onEdit?: () => void;
  onEditBio?: () => void;
  onPreview?: () => void;
  onSettings?: () => void;
  onAvatarPick?: (file: File) => void;
  editSectionHref?: string;
  onShowcaseSaved?: (codes: string[]) => void;
  onStatClick?: (key: ProfileStatKey) => void;
  showRatings?: boolean;
  showEco?: boolean;
  showShowcase?: boolean;
};

function BadgeIcon({ def, size = 12 }: { def: AchievementDef; size?: number }) {
  const Icon = ICONS[def.icon as keyof typeof ICONS] || Award;
  return <Icon size={size} strokeWidth={2.4} />;
}

export default function ProfileHeroCard({
  name,
  nickname,
  email,
  phone,
  roleLabel,
  image,
  publicCode,
  bio,
  legend,
  modernBadge,
  showcaseStored,
  showcaseHref = '/dashboard/showcase',
  instructionsVersion,
  instructionsCompletedAt,
  authority = null,
  authorityLabel,
  social = 50,
  ecoPoints = 0,
  levelMeta,
  editHref,
  settingsHref,
  publicHref,
  onEdit,
  onEditBio,
  onPreview,
  onSettings,
  onAvatarPick,
  editSectionHref = '#profile-edit',
  onShowcaseSaved,
  onStatClick,
  showRatings = true,
  showEco = true,
  showShowcase = true,
}: Props) {
  const emptyAch = useVoiceCopy('profile.empty.achievements', 'Пока нет открытых достижений');
  const { loadout } = useVoice();
  const equipped = useMemo(() => equippedLoadoutItems(loadout), [loadout]);
  const frameLook = shopFrameStyle(loadout.frame);
  const openEdit = onEdit || onEditBio;
  const [items, setItems] = useState<AchItem[]>([]);
  const [codes, setCodes] = useState<string[]>([]);
  const [draft, setDraft] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [achLoading, setAchLoading] = useState(true);
  const saveLock = useRef(false);

  const loadAchievements = useCallback(() => {
    setAchLoading(true);
    fetch('/api/user/achievements?lite=1', { cache: 'no-store' })
      .then(async (r) => {
        const raw = await r.text();
        try {
          return JSON.parse(raw) as { items?: AchItem[] };
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (!data || !Array.isArray(data?.items)) {
          setItems([]);
          setCodes([]);
          return;
        }
        const unlocked = (data.items as AchItem[]).filter((i) => i.unlocked);
        setItems(unlocked);
        const unlockedMeta: UnlockedShowcase[] = unlocked.map((i) => ({
          code: i.code,
          unlockedAt: i.unlockedAt || null,
        }));
        const stored = parseShowcaseBadges(showcaseStored);
        // Explicit empty array in DB means user cleared; missing → defaults
        const hasStored =
          showcaseStored !== null &&
          showcaseStored !== undefined &&
          !(typeof showcaseStored === 'string' && !showcaseStored.trim());
        const resolved = hasStored
          ? resolveShowcaseCodes(stored, unlockedMeta)
          : resolveShowcaseCodes(null, unlockedMeta);
        setCodes(resolved);
      })
      .catch(() => undefined)
      .finally(() => setAchLoading(false));
  }, [showcaseStored]);

  useEffect(() => {
    loadAchievements();
  }, [loadAchievements, instructionsVersion, instructionsCompletedAt]);

  const unlockedMeta = useMemo<UnlockedShowcase[]>(
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

  const startEdit = () => {
    setDraft([...codes]);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft([...codes]);
    setEditing(false);
  };

  const toggleDraft = (code: string) => {
    setDraft((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= SHOWCASE_MAX) {
        toast.error(`Можно выбрать не больше ${SHOWCASE_MAX}`);
        return prev;
      }
      return [...prev, code];
    });
  };

  const saveDraft = async () => {
    if (saveLock.current) return;
    const cleaned = Array.from(
      new Set(draft.filter((c) => unlockedMeta.some((u) => u.code === c)))
    ).slice(0, SHOWCASE_MAX);
    saveLock.current = true;
    setSaving(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showcaseBadges: cleaned }),
      });
      const raw = await res.text();
      let data: { message?: string; user?: { showcaseBadges?: string | string[] } } | null = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }
      if (!res.ok) throw new Error(data?.message || 'fail');
      const saved = parseShowcaseBadges(data?.user?.showcaseBadges ?? cleaned);
      setCodes(saved);
      setDraft(saved);
      setEditing(false);
      onShowcaseSaved?.(saved);
      toast.success(saved.length ? 'Значки сохранены' : 'Значки сняты');
    } catch (e) {
      toast.error(e instanceof Error && e.message !== 'fail' ? e.message : 'Не удалось сохранить значки');
    } finally {
      setSaving(false);
      saveLock.current = false;
    }
  };

  const displayName = nickname || name || 'Профиль';
  const showLegal = shouldShowLegalSub(nickname, name);
  const [stableImage, setStableImage] = useState(image || null);
  useEffect(() => {
    if (image) {
      setStableImage(image);
      try {
        if (publicCode) sessionStorage.setItem(`yp-avatar:${publicCode}`, image);
      } catch {
        /* ignore */
      }
    } else if (!stableImage && publicCode) {
      try {
        const cached = sessionStorage.getItem(`yp-avatar:${publicCode}`);
        if (cached) setStableImage(cached);
      } catch {
        /* ignore */
      }
    }
  }, [image, publicCode, stableImage]);
  const avatarStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    objectFit: 'cover',
  };

  const levelNum = levelMeta?.level ?? 1;
  const levelColor = levelMeta?.color ?? '#94a3b8';
  const levelTitle = levelMeta?.title ?? 'Новичок';
  const levelPct = levelMeta?.pct ?? 0;
  const showHud = showRatings || showEco;

  return (
    <div className={`profile-hero${legend ? ' is-legend' : ''}`}>
      <div className="profile-hero__main">
        <div className="profile-hero__avatar-col">
          <div
            className={`profile-hero__avatar${legend ? ' avatar-legend-frame' : ''}${onAvatarPick ? ' is-editable' : ''}${frameLook ? ' has-eco-frame' : ''}`}
            title={frameLook ? 'Рамка из магазина' : undefined}
          >
            <div className={legend ? 'avatar-legend-inner' : 'profile-hero__avatar-inner'}>
              {stableImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stableImage} alt="" style={avatarStyle} />
              ) : (
                <span className="profile-hero__avatar-fallback">
                  {displayName.charAt(0).toUpperCase() || <User size={22} />}
                </span>
              )}
            </div>
            {onAvatarPick ? (
              <label className="profile-hero__avatar-edit" title="Сменить фото">
                <Camera size={14} />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  capture="environment"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onAvatarPick(file);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            ) : null}
            {legend ? (
              <span className="profile-hero__avatar-pin profile-hero__avatar-pin--crown" title="Легенда Сочи">
                <Crown size={11} />
              </span>
            ) : null}
            {modernBadge ? (
              <span className="profile-hero__avatar-pin profile-hero__avatar-pin--zap" title="Современный человек">
                <Zap size={11} strokeWidth={2.5} />
              </span>
            ) : null}
          </div>
        </div>

        <div className="profile-hero__meta">
          <div className="profile-hero__name-row">
            <div className="profile-hero__name">{displayName}</div>
          </div>
          {showLegal ? <div className="profile-hero__sub">{name}</div> : null}
          {roleLabel ? <span className="profile-hero__role">{roleLabel}</span> : null}
          {email ? (
            <div className="profile-hero__email" title="Email скрыт в интерфейсе">
              <span>{maskEmail(email)}</span>
            </div>
          ) : null}
          {phone ? (
            <div className="profile-hero__email" title="Телефон скрыт в интерфейсе">
              <span>{maskPhone(phone)}</span>
            </div>
          ) : null}
          {publicCode ? (
            <button
              type="button"
              className="profile-hero__id"
              title="Скопировать публичный ID"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicCode);
                  toast.success('ID скопирован');
                } catch {
                  toast.error('Не удалось скопировать');
                }
              }}
            >
              ID {publicCode} <Copy size={11} />
            </button>
          ) : null}
        </div>
      </div>

      {bio ? (
        <p className="profile-hero__bio">{bio}</p>
      ) : openEdit ? (
        <button type="button" className="profile-hero__bio-cta" onClick={openEdit}>
          Добавьте пару слов о себе →
        </button>
      ) : (
        <a href={editSectionHref} className="profile-hero__bio-cta">
          Добавьте пару слов о себе →
        </a>
      )}

      <div className="profile-hero__toolbar" role="group" aria-label="Действия профиля">
        {openEdit ? (
          <button type="button" className="profile-hero__tool" onClick={openEdit}>
            <Pencil size={13} aria-hidden /> Редактировать
          </button>
        ) : (
          <a href={editSectionHref} className="profile-hero__tool">
            <Pencil size={13} aria-hidden /> Редактировать
          </a>
        )}
        {onSettings ? (
          <button type="button" className="profile-hero__tool" onClick={onSettings}>
            <Settings size={13} aria-hidden /> Настройки
          </button>
        ) : settingsHref ? (
          <Link href={settingsHref} className="profile-hero__tool">
            <Settings size={13} aria-hidden /> Настройки
          </Link>
        ) : null}
        {onPreview ? (
          <button type="button" className="profile-hero__tool" onClick={onPreview}>
            <UserCircle size={13} aria-hidden /> Вид
          </button>
        ) : publicHref ? (
          <Link href={publicHref} className="profile-hero__tool">
            <UserCircle size={13} aria-hidden /> Вид
          </Link>
        ) : null}
      </div>

      <div className="profile-hero__loadout-wrap">
      <details className="profile-hero__loadout-details">
        <summary className="profile-hero__loadout-summary">
          <span className="profile-hero__loadout-summary-main">
            <Sparkles size={14} aria-hidden />
            Оформление
            {equipped.length ? (
              <em className="profile-hero__loadout-count">{equipped.length}</em>
            ) : null}
          </span>
        </summary>
        {equipped.length ? (
          <div className="profile-hero__loadout" aria-label="Надетые предметы">
            <ul className="profile-hero__loadout-list">
              {equipped.map((item) => (
                <li
                  key={item.slot}
                  className="profile-hero__loadout-chip"
                  style={{ ['--chip' as string]: item.tint } as CSSProperties}
                  title={item.label}
                >
                  <span aria-hidden>{item.glyph}</span>
                  <em>{item.label}</em>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="profile-hero__loadout profile-hero__loadout--empty">
            <Sparkles size={14} aria-hidden />
            <span>Рамка аватара и тема профиля — в магазине. После покупки кольцо вокруг фото появится здесь.</span>
          </p>
        )}
      </details>
      <Link href="/dashboard/shop" className="profile-hero__loadout-link">
        Магазин
      </Link>
      </div>

      {showHud ? (
        <div className="profile-hero__stats" aria-label="Уровень, рейтинги и мбаллы">
          <PlayerProgressPanel
            level={levelNum}
            title={levelTitle}
            blurb={levelMeta?.blurb}
            color={levelColor}
            pct={levelPct}
            bandTitle={levelMeta?.bandTitle}
            bandId={levelMeta?.bandId}
            toNext={levelMeta?.toNext}
            nextReward={levelMeta?.nextReward}
            prestige={levelMeta?.prestige}
            authority={authority}
            authorityLabel={authorityLabel}
            social={social}
            ecoPoints={ecoPoints}
            showRatings={showRatings}
            showEco={showEco}
            onSelect={(key) => onStatClick?.(key)}
          />
        </div>
      ) : null}

      {showShowcase ? (
      <div className="profile-hero__showcase profile-hero__showcase--link">
        <div className="profile-hero__showcase-head">
          <div className="profile-hero__showcase-label">
            Витрина
            <span>
              {achLoading ? '…' : `${activeCodes.length}/${SHOWCASE_MAX}`}
            </span>
          </div>
          <Link href={showcaseHref} className="profile-hero__edit-btn">
            Открыть
          </Link>
        </div>
        <div className="profile-hero__showcase-body" aria-busy={achLoading}>
          {achLoading ? (
            <div className="profile-hero__showcase-skel" aria-hidden />
          ) : !defs.length ? (
            <p className="profile-hero__hint">
              {items.length
                ? 'Соберите значки и карты на странице витрины.'
                : 'Откройте достижения — затем оформите витрину профиля.'}
            </p>
          ) : (
            <div className="profile-hero__selected" aria-label="Витрина значков">
              {defs.map((def) => (
                <span
                  key={def.code}
                  className="profile-hero__chip"
                  style={{
                    borderColor: `color-mix(in srgb, ${def.accent} 40%, transparent)`,
                    background: `color-mix(in srgb, ${def.accent} 12%, #fff)`,
                    color: def.accent,
                  }}
                >
                  <BadgeIcon def={def} size={13} />
                  {def.title}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      ) : null}

    </div>
  );
}
