'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, UserCircle } from 'lucide-react';
import { RatingProgressChips, buildRatingItems, type RatingItem } from '@/components/RatingProgressIcons';

import { profileDisplayName, shouldShowLegalSub } from '@/lib/profile-display';

import { fetchProfileCached, fetchEcoCached } from '@/lib/user-data-client';

type ProfileLite = {
  id?: string;
  name?: string | null;
  nickname?: string | null;
  image?: string | null;
  publicCode?: string | null;
  reliabilityScore?: number | null;
  socialScore?: number | null;
  ecoPoints?: number | null;
};

type Props = {
  href: string;
  fallbackName?: string | null;
  active?: boolean;
  onNavigate?: () => void;
  /** sheet = compact identity card for mobile menu (profile entry, not settings) */
  variant?: 'default' | 'sheet';
  ctaLabel?: string;
  showRatings?: boolean;
};

export default function NavProfileCard({
  href,
  fallbackName,
  active = true,
  onNavigate,
  variant = 'default',
  ctaLabel,
  showRatings,
}: Props) {
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [items, setItems] = useState<RatingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const isSheet = variant === 'sheet';
  const ratingsOn = showRatings ?? !isSheet;
  const cta = ctaLabel ?? (isSheet ? 'Открыть профиль' : null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, e] = await Promise.all([fetchProfileCached(), fetchEcoCached()]);

      if (p?.id) setProfile(p as ProfileLite);

      const level = (e as any)?.level?.level;
      const ecoPoints =
        typeof (e as any)?.ecoPoints === 'number' ? (e as any).ecoPoints : (p as any)?.ecoPoints ?? 0;
      setItems(
        buildRatingItems({
          level: level?.level ?? 1,
          levelTitle: level?.title,
          levelColor: level?.color,
          levelPct: typeof (e as any)?.level?.pct === 'number' ? (e as any).level.pct : 0,
          authority: (p as any)?.reliabilityScore ?? 100,
          social: (p as any)?.socialScore ?? 50,
          ecoPoints,
          ecoPct:
            typeof (e as any)?.level?.pct === 'number'
              ? (e as any).level.pct
              : Math.min(100, ecoPoints),
        })
      );
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  useEffect(() => {
    if (!active) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (t) clearTimeout(t);
      t = setTimeout(() => void load(), 3000);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (t) clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [active, load]);

  const displayName = profileDisplayName({
    nickname: profile?.nickname,
    name: profile?.name,
    fallback: fallbackName || 'Мой профиль',
  });
  const sub =
    cta ||
    (shouldShowLegalSub(profile?.nickname, profile?.name)
      ? profile?.name
      : profile?.publicCode
        ? `ID ${profile.publicCode}`
        : null);

  return (
    <div className={`nav-profile-card${isSheet ? ' nav-profile-card--sheet' : ''}${loading ? ' is-loading' : ''}`}>
      <Link href={href} onClick={onNavigate} className="nav-profile-card__main">
        <span className="nav-profile-card__avatar" aria-hidden>
          {profile?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.image} alt="" />
          ) : (
            <UserCircle size={isSheet ? 32 : 28} strokeWidth={1.75} />
          )}
        </span>
        <span className="nav-profile-card__text">
          <span className="nav-profile-card__name">{displayName}</span>
          {sub ? <span className="nav-profile-card__sub">{sub}</span> : null}
        </span>
        {isSheet ? <ChevronRight size={18} className="nav-profile-card__chevron" aria-hidden /> : null}
      </Link>
      {ratingsOn ? (
        items.length > 0 ? (
          <RatingProgressChips items={items} className="nav-profile-card__ratings" />
        ) : (
          <div className="nav-profile-card__ratings-skeleton" aria-hidden />
        )
      ) : null}
    </div>
  );
}
