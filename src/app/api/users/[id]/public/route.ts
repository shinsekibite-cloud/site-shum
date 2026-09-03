import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  canRequestFriendOpenly,
  canViewFullProfile,
  computeTrustScore,
  inviteTokenValid,
  type ProfileVisibility,
} from '@/lib/social';
import { resolvePublicIdentity } from '@/lib/privacy-alias';
import { looksLikePublicCode, publicCodeLookupVariants } from '@/lib/public-id';
import { resolvePresenceForViewer } from '@/lib/presence';
import { parseTagList } from '@/lib/profile-meta';
import { ACHIEVEMENTS, TIER_META } from '@/lib/achievements';
import { encodeRouteParam } from '@/lib/route-id';
import {
  parseShowcaseBadges,
  resolveShowcaseCodes,
} from '@/lib/showcase-badges';
import { profileContribution, profileLevelProgress } from '@/lib/profile-level';
import { cosmeticsCatalogValue, parseCosmetics } from '@/lib/eco-points';
import { parseEcoLoadout } from '@/lib/eco-loadout';
import { parseCollectibles, collectiblesValue, COLLECTIBLE_CARDS, RARITY_META } from '@/lib/collectibles';

async function findUserByParam(idOrCode: string) {
  const select = {
    id: true,
    publicCode: true,
    nickname: true,
    name: true,
    image: true,
    city: true,
    bio: true,
    about: true,
    hobbies: true,
    interests: true,
    attendedCount: true,
    reliabilityScore: true,
    socialScore: true,
    ecoPoints: true,
    cosmeticsJson: true,
    ecoLoadoutJson: true,
    collectiblesJson: true,
    profileVisibility: true,
    friendInviteToken: true,
    lastActiveAt: true,
    onlineVisibility: true,
    deletedAt: true,
    blockedAt: true,
    steamUrl: true,
    vkUrl: true,
    telegramUrl: true,
    maxUrl: true,
    showcaseBadges: true,
    personalGalleryJson: true,
    instructionsVersion: true,
    instructionsCompletedAt: true,
  } as const;

  const byId = await prisma.user.findUnique({ where: { id: idOrCode }, select });
  if (byId) return byId;

  if (looksLikePublicCode(idOrCode) || idOrCode.toUpperCase().startsWith('YM-')) {
    const variants = publicCodeLookupVariants(idOrCode);
    for (const code of variants) {
      const u = await prisma.user.findUnique({ where: { publicCode: code }, select });
      if (u) return u;
    }
  }

  const byNick = await prisma.user.findFirst({
    where: { nickname: { equals: idOrCode, mode: 'insensitive' } },
    select,
  });
  return byNick;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ id: idParam }, session] = await Promise.all([
      params,
      getServerSession(authOptions),
    ]);
    const invite = new URL(req.url).searchParams.get('invite');

    const user = await findUserByParam(decodeURIComponent(idParam));
    if (!user || user.deletedAt || user.blockedAt) {
      return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
    }

    const id = user.id;
    const me = session?.user?.id;
    const isSelf = me === id;
    const isStaff =
      session?.user?.role === 'ADMIN' || session?.user?.role === 'MODERATOR';
    const visibility = (user.profileVisibility || 'FRIENDS') as ProfileVisibility;
    const hasValidInvite = inviteTokenValid(user.friendInviteToken, invite);

    // Guests: no personal data at all — only an auth gate (152-ФЗ / portal policy).
    if (!me) {
      return NextResponse.json({
        user: null,
        achievements: [],
        memberships: { clubs: [], projects: [] },
        mutualTrust: null,
        friendship: null,
        presence: null,
        isSelf: false,
        visibility,
        isPrivate: visibility === 'PRIVATE',
        canAddFriend: false,
        inviteRequired: true,
        limited: true,
        aliased: true,
        authenticated: false,
        requiresAuth: true,
        message:
          'Профили участников доступны только после входа. Гостям персональные данные не показываются.',
      });
    }

    let friendship: {
      id: string;
      status: string;
      direction: 'incoming' | 'outgoing';
    } | null = null;
    let mutualTrust: Awaited<ReturnType<typeof computeTrustScore>> | null = null;
    let isFriend = false;

    if (me && me !== id) {
      const [friendshipRow, trust] = await Promise.all([
        prisma.friendship.findFirst({
          where: {
            OR: [
              { requesterId: me, addresseeId: id },
              { requesterId: id, addresseeId: me },
            ],
          },
          select: { id: true, requesterId: true, status: true },
        }),
        computeTrustScore(me, id),
      ]);
      if (friendshipRow) {
        friendship = {
          id: friendshipRow.id,
          status: friendshipRow.status,
          direction: friendshipRow.requesterId === me ? 'outgoing' : 'incoming',
        };
        isFriend = friendshipRow.status === 'ACCEPTED';
      }
      mutualTrust = trust;
    }

    const full =
      canViewFullProfile({ visibility, isSelf, isFriend, authenticated: true }) ||
      Boolean(isStaff);
    const identity = resolvePublicIdentity({
      target: {
        id: user.id,
        name: user.nickname || user.name,
        image: user.image,
        profileVisibility: user.profileVisibility,
      },
      viewerId: me,
      isFriend,
      isStaff,
    });
    const canAdd =
      !isSelf &&
      !friendship &&
      (canRequestFriendOpenly(visibility) || (visibility === 'PRIVATE' && hasValidInvite));

    const socials = full
      ? {
          steamUrl: user.steamUrl,
          vkUrl: user.vkUrl,
          telegramUrl: user.telegramUrl,
          maxUrl: user.maxUrl,
        }
      : {
          steamUrl: null,
          vkUrl: null,
          telegramUrl: null,
          maxUrl: null,
        };

    const presence = await resolvePresenceForViewer({
      viewerId: me,
      targetId: id,
      targetLastActiveAt: user.lastActiveAt,
      targetOnlineVisibility: user.onlineVisibility,
      targetProfileVisibility: visibility,
      isFriend,
    });

    if (!full && visibility === 'PRIVATE' && !hasValidInvite) {
      return NextResponse.json({
        user: {
          id: user.id,
          publicCode: user.publicCode,
          nickname: null,
          name: identity.name,
          image: identity.image,
          city: null,
          bio: null,
          about: null,
          hobbies: [],
          interests: [],
          attendedCount: null,
          reliabilityScore: null,
          socialScore: null,
          ...socials,
        },
        achievements: [],
        memberships: { clubs: [], projects: [] },
        mutualTrust,
        friendship,
        presence: null,
        isSelf,
        visibility,
        isPrivate: true,
        canAddFriend: false,
        inviteRequired: true,
        limited: true,
        aliased: identity.aliased,
        authenticated: Boolean(me),
      });
    }

    const [portfolio, achievementRows, applications] = await Promise.all([
      full || isSelf || isStaff
        ? prisma.userPortfolio.findUnique({
            where: { userId: id },
            select: { status: true, userId: true, headline: true, summary: true },
          })
        : Promise.resolve(null),
      full
        ? prisma.userAchievement.findMany({
            where: { userId: id },
            orderBy: { unlockedAt: 'desc' },
            select: { code: true, unlockedAt: true },
          })
        : Promise.resolve([]),
      full
        ? prisma.application.findMany({
            where: {
              userId: id,
              status: 'APPROVED',
              OR: [{ clubId: { not: null } }, { projectId: { not: null } }],
            },
            take: 16,
            orderBy: { updatedAt: 'desc' },
            select: {
              club: { select: { id: true, title: true } },
              project: { select: { id: true, title: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const defByCode = new Map(ACHIEVEMENTS.map((a) => [a.code, a]));
    const { isInstructionsBadgeActive } = await import('@/lib/profile-guides');
    const instructedActive = isInstructionsBadgeActive({
      instructionsVersion: (user as { instructionsVersion?: string | null }).instructionsVersion,
      instructionsCompletedAt: (user as { instructionsCompletedAt?: Date | null }).instructionsCompletedAt,
    });
    const achievementRowsLive = instructedActive
      ? achievementRows
      : achievementRows.filter((r) => r.code !== 'INSTRUCTED');

    const achievements = achievementRowsLive
      .slice(0, 12)
      .map((row) => {
        const def = defByCode.get(row.code);
        if (!def) return null;
        return {
          code: def.code,
          title: def.title,
          tier: def.tier,
          accent: def.accent,
          tierLabel: TIER_META[def.tier].label,
          unlockedAt: row.unlockedAt,
        };
      })
      .filter(Boolean);

    const showcaseCodes = resolveShowcaseCodes(
      parseShowcaseBadges(user.showcaseBadges),
      achievementRowsLive.map((r) => ({ code: r.code, unlockedAt: r.unlockedAt }))
    );
    const showcaseBadges = showcaseCodes
      .map((code) => {
        const def = defByCode.get(code);
        if (!def) return null;
        return {
          code: def.code,
          title: def.title,
          tier: def.tier,
          accent: def.accent,
          icon: def.icon,
        };
      })
      .filter(Boolean);

    const clubs: { id: string; title: string; href: string }[] = [];
    const projects: { id: string; title: string; href: string }[] = [];
    for (const app of applications) {
      if (app.club) {
        clubs.push({
          id: app.club.id,
          title: app.club.title,
          href: `/clubs/${encodeRouteParam(app.club.id)}`,
        });
      }
      if (app.project) {
        projects.push({
          id: app.project.id,
          title: app.project.title,
          href: `/projects/${encodeRouteParam(app.project.id)}`,
        });
      }
    }

    const { galleryUrls, parseGalleryItems } = await import('@/lib/gallery');
    const { publicGalleryItems } = await import('@/lib/image-moderation');
    const gallery = full
      ? galleryUrls(
          publicGalleryItems(
            parseGalleryItems(
              (user as { personalGalleryJson?: string | null }).personalGalleryJson,
              24
            )
          )
        )
      : [];

    return NextResponse.json({
      user: {
        id: user.id,
        publicCode: user.publicCode,
        nickname: full ? user.nickname : null,
        name: identity.name,
        image: identity.image,
        city: full ? user.city : null,
        bio: full ? user.bio?.slice(0, 280) || null : null,
        about: full ? user.about?.slice(0, 1200) || null : null,
        hobbies: full ? parseTagList(user.hobbies) : [],
        interests: full ? parseTagList(user.interests) : [],
        attendedCount: full ? user.attendedCount ?? 0 : null,
        reliabilityScore: full ? user.reliabilityScore : null,
        socialScore: full ? (user as { socialScore?: number }).socialScore ?? 50 : null,
        ecoPoints: full ? (user as { ecoPoints?: number | null }).ecoPoints ?? 0 : null,
        ...socials,
      },
      gallery,
      achievements,
      showcaseBadges,
      cardShowcase: full
        ? (() => {
            try {
              const col = parseCollectibles((user as { collectiblesJson?: string | null }).collectiblesJson);
              return (col.showcase || [])
                .map((id) => {
                  const card = COLLECTIBLE_CARDS.find((c) => c.id === id);
                  if (!card) return null;
                  const rarityMeta = RARITY_META[card.rarity];
                  return {
                    id: card.id,
                    title: card.title,
                    series: card.series,
                    rarity: card.rarity,
                    tagline: card.tagline,
                    accent: card.accent,
                    glyph: card.glyph,
                    rarityLabel: rarityMeta.label,
                    rarityColor: rarityMeta.color,
                  };
                })
                .filter(Boolean);
            } catch {
              return [];
            }
          })()
        : [],
      memberships: { clubs, projects },
      mutualTrust,
      friendship,
      presence,
      level: full
        ? (() => {
            try {
              const owned = parseCosmetics((user as { cosmeticsJson?: string | null }).cosmeticsJson);
              const col = parseCollectibles((user as { collectiblesJson?: string | null }).collectiblesJson);
              const contribution = profileContribution({
                ecoPoints: (user as { ecoPoints?: number | null }).ecoPoints ?? 0,
                cosmeticsValue: cosmeticsCatalogValue(owned),
                collectiblesValue: collectiblesValue(col),
              });
              return profileLevelProgress(contribution);
            } catch {
              return profileLevelProgress((user as { ecoPoints?: number | null }).ecoPoints ?? 0);
            }
          })()
        : null,
      ecoPoints: full ? (user as { ecoPoints?: number | null }).ecoPoints ?? 0 : null,
      ecoLoadout: full
        ? parseEcoLoadout((user as { ecoLoadoutJson?: string | null }).ecoLoadoutJson)
        : null,
      portfolio:
        portfolio?.status === 'APPROVED'
          ? {
              status: 'APPROVED',
              href: `/portfolio/${id}`,
              downloadHref: `/api/portfolio/${id}/download?mode=download`,
              printHref: `/api/portfolio/${id}/download?mode=print`,
              headline: portfolio.headline || null,
              summary: portfolio.summary?.slice(0, 220) || null,
            }
          : isSelf && portfolio
            ? {
                status: portfolio.status,
                href: '/dashboard/portfolio',
                headline: portfolio.headline || null,
                summary: null,
              }
            : null,
      onlineVisibility: isSelf ? user.onlineVisibility || 'FRIENDS' : undefined,
      isSelf,
      visibility,
      isPrivate: visibility === 'PRIVATE',
      canAddFriend: canAdd,
      inviteRequired: visibility === 'PRIVATE' && !isFriend && !isSelf,
      inviteOk: hasValidInvite,
      limited: !full,
      aliased: identity.aliased,
      authenticated: Boolean(me),
    });
  } catch (error) {
    console.error('GET /api/users/[id]/public', error);
    return NextResponse.json({ message: 'Ошибка загрузки профиля' }, { status: 500 });
  }
}
