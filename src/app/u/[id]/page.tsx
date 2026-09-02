'use client';

import { useSafeSearchParams } from '@/lib/use-safe-search-params';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Briefcase,
  Copy,
  Download,
  ExternalLink,
  Lock,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Settings,
  Share2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import UserAvatar from '@/components/UserAvatar';
import YpActionSheet from '@/components/YpActionSheet';
import { avatarFrameFromTiers, pickAvatarBadgeCodes } from '@/lib/avatar-frame';
import { TIER_META, type AchievementTier } from '@/lib/achievements';
import MutualOverlapChips from '@/components/MutualOverlapChips';
import PhotoGallery from '@/components/PhotoGallery';
import ReputationHistoryModal from '@/components/ReputationHistoryModal';
import {
  RatingProgressChips,
  buildRatingItems,
  type RatingKind,
} from '@/components/RatingProgressIcons';
import {
  ecoLoadoutToDomAttrs,
  shopFrameStyle,
  type EcoLoadout,
} from '@/lib/eco-loadout';
import '@/app/messages/messages.css';

type PublicProfile = {
  user: {
    id: string;
    publicCode?: string | null;
    nickname?: string | null;
    name: string | null;
    image: string | null;
    city: string | null;
    bio: string | null;
    about?: string | null;
    hobbies?: string[];
    interests?: string[];
    attendedCount?: number | null;
    reliabilityScore: number | null;
    socialScore?: number | null;
    ecoPoints?: number | null;
    steamUrl?: string | null;
    vkUrl?: string | null;
    telegramUrl?: string | null;
    maxUrl?: string | null;
  } | null;
  gallery?: string[];
  achievements?: {
    code: string;
    title: string;
    tier: string;
    accent: string;
    tierLabel: string;
  }[];
  showcaseBadges?: {
    code: string;
    title: string;
    tier: string;
    accent: string;
    icon?: string;
  }[];
  cardShowcase?: {
    id: string;
    title: string;
    series: string;
    rarity: string;
    tagline: string;
    accent: string;
    glyph: string;
    rarityLabel: string;
    rarityColor: string;
  }[];
  ecoLoadout?: EcoLoadout | null;
  memberships?: {
    clubs: { id: string; title: string; href: string }[];
    projects: { id: string; title: string; href: string }[];
  };
  mutualTrust: {
    score: number;
    label: string;
    sharedEvents: number;
    messages: number;
    friendDays: number;
    overlap?: {
      clubs: { id: string; title: string }[];
      projects: { id: string; title: string }[];
      spaces: { id: string; title: string }[];
      interests: string[];
    };
  } | null;
  presence?: { online: boolean; label: string } | null;
  portfolio?: {
    status: string;
    href: string;
    downloadHref?: string;
    printHref?: string;
    headline?: string | null;
    summary?: string | null;
  } | null;
  ecoPoints?: number | null;
  level?: {
    pct?: number;
    level?: { level?: number; title?: string; color?: string };
  } | null;
  friendship: {
    id: string;
    status: string;
    direction: 'incoming' | 'outgoing';
  } | null;
  isSelf: boolean;
  visibility?: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  isPrivate?: boolean;
  canAddFriend?: boolean;
  inviteRequired?: boolean;
  inviteOk?: boolean;
  limited?: boolean;
  aliased?: boolean;
  authenticated?: boolean;
  requiresAuth?: boolean;
  message?: string;
};

const primaryButton = {
  border: 0,
  borderRadius: 11,
  padding: '0.65rem 0.9rem',
  fontWeight: 750,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  cursor: 'pointer',
  textDecoration: 'none',
} as const;

function PublicUserPageInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSafeSearchParams();
  const id = params.id;
  const invite = searchParams.get('invite') || '';
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [repModalOpen, setRepModalOpen] = useState(false);
  const [repModalTab, setRepModalTab] = useState<'LEVEL' | 'AUTHORITY' | 'SOCIAL' | 'ECO'>('AUTHORITY');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<'home' | 'gallery' | 'achievements' | 'portfolio'>('home');

  const load = useCallback(async () => {
    const qs = invite ? `?invite=${encodeURIComponent(invite)}` : '';
    const response = await fetch(`/api/users/${encodeURIComponent(id)}/public${qs}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Профиль не найден');
    setProfile(result);
  }, [id, invite]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const qs = invite ? `?invite=${encodeURIComponent(invite)}` : '';
        const response = await fetch(`/api/users/${encodeURIComponent(id)}/public${qs}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Профиль не найден');
        if (!cancelled) setProfile(result);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Ошибка');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    initialize();
    return () => {
      cancelled = true;
    };
  }, [id, invite]);

  const addFriend = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, invite: invite || undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Не удалось отправить заявку');
      await load();
      toast.success('Заявка отправлена');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const updateFriendship = async (action: 'accept' | 'decline' | 'cancel' | 'remove') => {
    if (!profile?.friendship) return;
    setBusy(true);
    try {
      const response = await fetch('/api/friends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId: profile.friendship.id, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Не удалось выполнить действие');
      await load();
      toast.success(
        action === 'accept' ? 'Теперь вы друзья' : action === 'remove' ? 'Удалено из друзей' : 'Готово'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="container" style={{ padding: '2rem 1rem' }}>Загрузка…</div>;
  }
  if (!profile) {
    return (
      <div className="container" style={{ padding: '2rem 1rem', textAlign: 'center' }}>
        Профиль не найден
      </div>
    );
  }

  // Guest gate — no personal data until login
  if (profile.requiresAuth || !profile.authenticated || !profile.user) {
    const callback = `/u/${encodeURIComponent(id)}${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`;
    return (
      <main className="container" style={{ padding: '1.5rem 1rem 2.5rem', maxWidth: 520 }}>
        <section className="yp-surface yp-guest-gate" style={{ padding: '1.75rem 1.35rem', textAlign: 'center' }}>
          <div
            style={{
              width: 72,
              height: 72,
              margin: '0 auto 1rem',
              borderRadius: '50%',
              background: 'var(--surface-elevated)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--primary)',
            }}
          >
            <Lock size={32} />
          </div>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.45rem' }}>Профиль закрыт для гостей</h1>
          <p style={{ margin: '0 0 1.35rem', color: 'var(--muted)', lineHeight: 1.55, fontSize: '0.95rem' }}>
            {profile.message ||
              'Персональные данные участников доступны только авторизованным пользователям. Войдите или зарегистрируйтесь.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(callback)}`}
              className="btn btn-primary"
              style={{ width: '100%', ...primaryButton }}
            >
              Войти
            </Link>
            <Link
              href={`/register?callbackUrl=${encodeURIComponent(callback)}`}
              className="btn btn-secondary"
              style={{ width: '100%', ...primaryButton, background: 'var(--surface-elevated)', color: 'var(--foreground)' }}
            >
              Зарегистрироваться
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const { user, friendship, mutualTrust, presence, portfolio } = profile;
  const gallery = profile.gallery || [];
  const reliability =
    user.reliabilityScore == null ? null : Math.max(0, Math.min(100, user.reliabilityScore));
  const social =
    user.socialScore == null ? null : Math.max(0, Math.min(100, user.socialScore));
  const showAdd = Boolean(profile.canAddFriend) || Boolean(profile.inviteOk && !friendship);
  const hobbies = user.hobbies || [];
  const interests = user.interests || [];
  const achievements = profile.achievements || [];
  const achTiers = achievements
    .map((a) => a.tier)
    .filter((t): t is AchievementTier => t === 'bronze' || t === 'silver' || t === 'gold');
  const frame = avatarFrameFromTiers(achTiers);
  const shopFrame = shopFrameStyle(profile.ecoLoadout?.frame);
  const frameBorder = shopFrame?.border || frame.border;
  const frameGlow = shopFrame?.glow || frame.glow;
  const ecoAttrs = ecoLoadoutToDomAttrs(profile.ecoLoadout || {});
  const showcase = profile.showcaseBadges || [];
  const cardShowcase = profile.cardShowcase || [];
  const avatarBadges = (
    showcase.length
      ? showcase.map((b) => ({
          label: b.tier === 'gold' ? '★' : b.tier === 'silver' ? '◆' : '●',
          color: b.accent || TIER_META[(b.tier as AchievementTier) || 'bronze']?.color || '#64748b',
          title: b.title,
        }))
      : pickAvatarBadgeCodes(
          achievements.map((a) => ({ code: a.code, tier: (a.tier as AchievementTier) || 'bronze' }))
        ).map((b) => ({
          label: b.tier === 'gold' ? '★' : b.tier === 'silver' ? '◆' : '●',
          color: TIER_META[b.tier].color,
          title: achievements.find((x) => x.code === b.code)?.title || b.code,
        }))
  );
  const clubs = profile.memberships?.clubs || [];
  const projects = profile.memberships?.projects || [];
  const tags = [...new Set([...interests, ...hobbies])];

  const copyProfileLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const shareProfile = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: user.name || 'Профиль',
          url: window.location.href,
        });
        return;
      }
    } catch {
      /* fall through */
    }
    await copyProfileLink();
  };

  const sheetItems = profile.isSelf
    ? [
        {
          id: 'edit',
          label: 'Редактировать профиль',
          icon: <Pencil size={20} />,
          href: '/dashboard#profile-edit',
        },
        {
          id: 'copy',
          label: 'Скопировать ссылку',
          icon: <Copy size={20} />,
          onClick: () => void copyProfileLink(),
        },
        {
          id: 'share',
          label: 'Поделиться профилем',
          icon: <Share2 size={20} />,
          onClick: () => void shareProfile(),
        },
        {
          id: 'settings',
          label: 'Настройки и безопасность',
          icon: <Settings size={20} />,
          href: '/dashboard/settings',
        },
        {
          id: 'portfolio',
          label: 'Портфолио',
          icon: <Briefcase size={20} />,
          href: '/dashboard/portfolio',
        },
      ]
    : [
        {
          id: 'copy',
          label: 'Скопировать ссылку',
          icon: <Copy size={20} />,
          onClick: () => void copyProfileLink(),
        },
        {
          id: 'share',
          label: 'Поделиться профилем',
          icon: <Share2 size={20} />,
          onClick: () => void shareProfile(),
        },
        ...(friendship?.status === 'ACCEPTED'
          ? [
              {
                id: 'msg',
                label: 'Написать сообщение',
                icon: <MessageCircle size={20} />,
                href: `/messages?with=${user.id}`,
              },
              {
                id: 'unfriend',
                label: 'Удалить из друзей',
                icon: <UserMinus size={20} />,
                onClick: () => void updateFriendship('remove'),
                danger: true,
              },
            ]
          : []),
      ];

  return (
    <main className="yp-profile yp-eco-surface" {...ecoAttrs}>
      <header className="yp-profile__top">
        <Link href="/dashboard" className="yp-profile__icon-btn" aria-label="Назад">
          ←
        </Link>
        <div className="yp-profile__top-title">{user.name || 'Профиль'}</div>
        <button
          type="button"
          className="yp-profile__icon-btn"
          aria-label="Ещё"
          onClick={() => setSheetOpen(true)}
        >
          <MoreHorizontal size={20} />
        </button>
      </header>

      <section className="yp-profile__hero">
        <div className="yp-profile__cover" aria-hidden />
        <div className="yp-profile__avatar-wrap">
          <UserAvatar
            name={user.name}
            image={user.image}
            size={112}
            aliased={Boolean(profile.aliased)}
            online={presence?.online}
            showStatus={presence != null}
            frameColor={frameBorder}
            frameGlow={frameGlow}
            badges={avatarBadges}
          />
        </div>

        <h1 className="yp-profile__name">{user.name || 'Пользователь'}</h1>
        {user.nickname && user.nickname !== user.name ? (
          <div className="yp-profile__nick">@{user.nickname}</div>
        ) : null}
        {presence ? (
          <div className={`yp-profile__presence${presence.online ? ' is-online' : ''}`}>
            {presence.label}
          </div>
        ) : null}

        <div className="yp-profile__meta">
          {user.publicCode ? <span>ID {user.publicCode}</span> : null}
          {user.city ? (
            <span>
              <MapPin size={13} /> {user.city}
            </span>
          ) : null}
          {(profile.isPrivate || profile.visibility === 'FRIENDS' || profile.aliased) && (
            <span className="yp-profile__lock">
              <Lock size={12} />
              {profile.aliased
                ? 'Псевдоним'
                : profile.visibility === 'PRIVATE'
                  ? 'Закрытый'
                  : 'Для друзей'}
            </span>
          )}
        </div>

        {profile.isSelf ? (
          user.bio ? <p className="yp-profile__bio">{user.bio}</p> : null
        ) : user.bio ? (
          <p className="yp-profile__bio">{user.bio}</p>
        ) : null}

        {profile.isSelf ? (
          <Link href="/dashboard#profile-edit" className="yp-profile__cta">
            <Pencil size={18} /> Редактировать профиль
          </Link>
        ) : friendship?.status === 'ACCEPTED' ? (
          <Link href={`/messages?with=${user.id}`} className="yp-profile__cta">
            <MessageCircle size={18} /> Написать
          </Link>
        ) : showAdd && !friendship ? (
          <button type="button" className="yp-profile__cta" onClick={addFriend} disabled={busy}>
            <UserPlus size={18} /> Добавить в друзья
          </button>
        ) : friendship?.status === 'PENDING' && friendship.direction === 'outgoing' ? (
          <button type="button" className="yp-profile__cta yp-profile__cta--ghost" disabled>
            Заявка отправлена
          </button>
        ) : friendship?.status === 'PENDING' && friendship.direction === 'incoming' ? (
          <div className="yp-profile__cta-row">
            <button type="button" className="yp-profile__cta" onClick={() => updateFriendship('accept')} disabled={busy}>
              Принять
            </button>
            <button
              type="button"
              className="yp-profile__cta yp-profile__cta--ghost"
              onClick={() => updateFriendship('decline')}
              disabled={busy}
            >
              Отклонить
            </button>
          </div>
        ) : null}

        {!profile.isSelf && friendship?.status === 'PENDING' && friendship.direction === 'outgoing' ? (
          <button
            type="button"
            className="yp-profile__text-btn"
            onClick={() => updateFriendship('cancel')}
            disabled={busy}
          >
            Отменить заявку
          </button>
        ) : null}

        {profile.limited && !profile.isSelf ? (
          <p className="yp-profile__limited">
            {profile.inviteRequired && !profile.inviteOk
              ? 'Профиль закрыт. Добавить в друзья можно только по приглашению.'
              : 'Подробности профиля доступны друзьям.'}
          </p>
        ) : null}
      </section>

      {!profile.limited ? (
        <div className="yp-profile__tabs" role="tablist" aria-label="Разделы профиля">
          {(
            [
              { id: 'home' as const, label: 'Главная' },
              { id: 'gallery' as const, label: 'Фото' },
              { id: 'achievements' as const, label: 'Достижения' },
              { id: 'portfolio' as const, label: 'Портфолио' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`yp-profile__tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {!profile.limited && tab === 'home' ? (
        <div className="yp-profile__body">
          <div className="yp-profile__card">
            <RatingProgressChips
              items={buildRatingItems({
                level: profile.level?.level?.level ?? 1,
                levelTitle: profile.level?.level?.title,
                levelColor: profile.level?.level?.color,
                levelPct: profile.level?.pct ?? 0,
                authority: reliability ?? 100,
                social: social ?? 50,
                ecoPoints: profile.ecoPoints ?? user.ecoPoints ?? 0,
                ecoPct: profile.level?.pct ?? 0,
              })}
              onSelect={
                profile.isSelf
                  ? (kind: RatingKind) => {
                      setRepModalTab(kind);
                      setRepModalOpen(true);
                    }
                  : undefined
              }
            />
          </div>

          {(showcase.length > 0 || cardShowcase.length > 0) && (
            <div className="yp-profile__card yp-profile__showcase">
              <h2>Витрина</h2>
              {showcase.length > 0 ? (
                <div className="yp-profile__badge-row" aria-label="Значки">
                  {showcase.map((b) => (
                    <span
                      key={b.code}
                      className="yp-profile__badge-chip"
                      style={{
                        borderColor: `color-mix(in srgb, ${b.accent} 40%, transparent)`,
                        background: `color-mix(in srgb, ${b.accent} 12%, #fff)`,
                        color: b.accent,
                      }}
                    >
                      {b.title}
                    </span>
                  ))}
                </div>
              ) : null}
              {cardShowcase.length > 0 ? (
                <div className="yp-profile__card-grid" aria-label="Коллекционные карты">
                  {cardShowcase.map((c) => (
                    <article
                      key={c.id}
                      className="yp-profile__collectible"
                      style={{ ['--card-accent' as string]: c.accent }}
                    >
                      <span className="yp-profile__collectible-glyph" aria-hidden>
                        {c.glyph}
                      </span>
                      <strong>{c.title}</strong>
                      <small style={{ color: c.rarityColor }}>{c.rarityLabel}</small>
                      <em>{c.tagline}</em>
                    </article>
                  ))}
                </div>
              ) : null}
              {profile.isSelf ? (
                <Link href="/dashboard/showcase" className="yp-profile__text-btn" style={{ marginTop: 10 }}>
                  Изменить витрину
                </Link>
              ) : null}
            </div>
          )}

          {user.about ? (
            <div className="yp-profile__card">
              <h2>О себе</h2>
              <p className="yp-profile__about">{user.about}</p>
            </div>
          ) : null}

          {portfolio?.status === 'APPROVED' ? (
            <div className="yp-profile__card">
              <h2>
                <Briefcase size={16} /> Портфолио
              </h2>
              {portfolio.headline ? <strong>{portfolio.headline}</strong> : null}
              {portfolio.summary ? <p className="yp-profile__muted">{portfolio.summary}</p> : null}
              <div className="yp-profile__cta-row">
                <button type="button" className="yp-profile__cta yp-profile__cta--sm" onClick={() => setTab('portfolio')}>
                  Открыть
                </button>
                <Link href={portfolio.href} className="yp-profile__cta yp-profile__cta--ghost yp-profile__cta--sm">
                  <ExternalLink size={16} /> Страница
                </Link>
              </div>
            </div>
          ) : null}

          {tags.length > 0 ? (
            <div className="yp-profile__card">
              <h2>Интересы</h2>
              <div className="yp-profile__tags">
                {tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
          ) : null}

          {(user.steamUrl || user.vkUrl || user.telegramUrl || user.maxUrl) && (
            <div className="yp-profile__card yp-profile__links">
              {user.vkUrl ? (
                <a href={user.vkUrl} target="_blank" rel="noopener noreferrer">
                  VK
                </a>
              ) : null}
              {user.telegramUrl ? (
                <a href={user.telegramUrl} target="_blank" rel="noopener noreferrer">
                  Telegram
                </a>
              ) : null}
              {user.maxUrl ? (
                <a href={user.maxUrl} target="_blank" rel="noopener noreferrer">
                  MAX
                </a>
              ) : null}
              {user.steamUrl ? (
                <a href={user.steamUrl} target="_blank" rel="noopener noreferrer">
                  Steam
                </a>
              ) : null}
            </div>
          )}

          {(clubs.length > 0 || projects.length > 0) && (
            <div className="yp-profile__card">
              <h2>
                <Users size={16} /> Участие
              </h2>
              {clubs.length > 0 ? (
                <div className="yp-profile__tags">
                  {clubs.map((c) => (
                    <Link key={c.id} href={c.href}>
                      {c.title}
                    </Link>
                  ))}
                </div>
              ) : null}
              {projects.length > 0 ? (
                <div className="yp-profile__tags" style={{ marginTop: 8 }}>
                  {projects.map((p) => (
                    <Link key={p.id} href={p.href}>
                      {p.title}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {!profile.isSelf ? (
            <div className="yp-profile__card">
              <h2>
                <Users size={16} /> Взаимное доверие
              </h2>
              {mutualTrust ? (
                <>
                  <div className="yp-profile__trust">
                    <strong>{mutualTrust.score}%</strong>
                    <span>{mutualTrust.label}</span>
                  </div>
                  <div className="yp-profile__trust-bar">
                    <i style={{ width: `${mutualTrust.score}%` }} />
                  </div>
                  <p className="yp-profile__muted">
                    Общих событий: {mutualTrust.sharedEvents} · сообщений: {mutualTrust.messages}
                  </p>
                  <MutualOverlapChips overlap={mutualTrust.overlap} />
                </>
              ) : (
                <p className="yp-profile__muted">
                  {friendship?.status === 'PENDING'
                    ? 'Доверие станет доступно после принятия заявки.'
                    : 'Появится, когда вы станете друзьями или появится общая активность.'}
                </p>
              )}
            </div>
          ) : null}

          {profile.isSelf ? (
            <details className="yp-profile__card yp-profile__guide">
              <summary>Как оформить профиль</summary>
              <ol>
                <li>Загрузите фото — рамка подсветится цветом лучших ачивок.</li>
                <li>Заполните «О себе», хобби и город.</li>
                <li>В кабинете → Портфолио добавьте грамоты.</li>
                <li>Следите за рейтингом надёжности.</li>
              </ol>
            </details>
          ) : null}
        </div>
      ) : null}

      {!profile.limited && tab === 'gallery' ? (
        <div className="yp-profile__body">
          <div className="yp-profile__card">
            {gallery.length > 0 ? (
              <PhotoGallery images={gallery} hideTitle />
            ) : (
              <p className="yp-profile__muted">Пока нет фото в галерее.</p>
            )}
          </div>
        </div>
      ) : null}

      {!profile.limited && tab === 'achievements' ? (
        <div className="yp-profile__body">
          <div className="yp-profile__card">
            <h2>
              <Award size={16} /> Достижения
            </h2>
            {achievements.length > 0 ? (
              <div className="profile-achs__list">
                {achievements.map((a) => (
                  <span
                    key={a.code}
                    className="profile-achs__chip"
                    title={`${a.tierLabel}: ${a.title}`}
                    style={{ ['--ach-accent' as string]: a.accent }}
                  >
                    <i className={`profile-achs__dot is-${a.tier}`} aria-hidden />
                    {a.title}
                  </span>
                ))}
              </div>
            ) : (
              <p className="yp-profile__muted">Пока нет открытых достижений.</p>
            )}
          </div>
        </div>
      ) : null}

      {!profile.limited && tab === 'portfolio' ? (
        <div className="yp-profile__body">
          <div className="yp-profile__card">
            {portfolio?.status === 'APPROVED' ? (
              <>
                <h2>
                  <Briefcase size={16} /> Портфолио
                </h2>
                {portfolio.headline ? <strong>{portfolio.headline}</strong> : null}
                {portfolio.summary ? <p className="yp-profile__muted">{portfolio.summary}</p> : null}
                <div className="yp-profile__cta-row">
                  <Link href={portfolio.href} className="yp-profile__cta yp-profile__cta--sm">
                    <ExternalLink size={16} /> Смотреть
                  </Link>
                  <a
                    href={portfolio.downloadHref || `/api/portfolio/${user.id}/download?mode=download`}
                    className="yp-profile__cta yp-profile__cta--ghost yp-profile__cta--sm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={16} /> Скачать
                  </a>
                </div>
              </>
            ) : (
              <p className="yp-profile__muted">
                {profile.isSelf
                  ? 'Опубликуйте портфолио в кабинете — оно появится здесь после модерации.'
                  : 'Портфолио ещё не опубликовано.'}
              </p>
            )}
          </div>
        </div>
      ) : null}

      <YpActionSheet
        open={sheetOpen}
        title="Действия"
        onClose={() => setSheetOpen(false)}
        items={sheetItems}
      />

      {profile.isSelf ? (
        <ReputationHistoryModal
          open={repModalOpen}
          initialTab={repModalTab}
          onClose={() => setRepModalOpen(false)}
        />
      ) : null}
    </main>
  );
}


export default function PublicUserPage() {
  return <PublicUserPageInner />;
}
