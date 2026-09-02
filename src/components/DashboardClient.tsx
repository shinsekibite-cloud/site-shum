'use client';

import { useSafeSearchParams } from '@/lib/use-safe-search-params';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  User,
  UserCircle,
  Settings,
  Shield,
  FileText,
  Ticket,
  Pencil,
  ImagePlus,
  Crown,
  Award,
  Medal,
  Zap,
  Briefcase,
  FolderKanban,
  Users,
  CalendarDays,
  Building2,
  HandHeart,
  Ban,
  ChevronRight,
  LayoutDashboard,
  ShoppingBag,
  Home,
  LogOut,
  Gamepad2,
  Gift,
  BookOpen,
  LayoutGrid,
  MessageCircle,
  Leaf,
} from 'lucide-react';
import toast from 'react-hot-toast';
import EventSoonNotifier from '@/components/EventSoonNotifier';
import TagPicker from '@/components/TagPicker';
import { collectDeviceFingerprint } from '@/lib/device-fingerprint';
import ProfileHeroCard from '@/components/ProfileHeroCard';
import PersonalQrPanel from '@/components/PersonalQrPanel';
import CoworkingCabinetList from '@/components/CoworkingCabinetList';
import { zodiacFromDate } from '@/lib/profile-meta';
import { formatMskDate, formatMskDateTime, formatMskTime } from '@/lib/booking-hours';
import { fairyTaleAvatarUrl, fairyTaleDisplayName } from '@/lib/privacy-alias';
import UserAvatar from '@/components/UserAvatar';
import {
  QUICK_ACCESS_TUTORIAL_DONE_EVENT,
} from '@/lib/quick-access';
import { fetchPublicStatusCached } from '@/lib/public-status-client';
import { fetchProfileCached, fetchEcoCached } from '@/lib/user-data-client';
import { cabinetGet, readCabinetJson } from '@/lib/cabinet-fetch';
import { roleLabelRu } from '@/lib/role-labels';
import { signOutLogged } from '@/lib/sign-out-logged';

const QRCodeDisplay = dynamic(() => import('@/components/QRCodeDisplay'), { ssr: false });
const AddToCalendarButton = dynamic(() => import('@/components/AddToCalendarButton'), { ssr: false });
const AchievementsPanel = dynamic(() => import('@/components/AchievementsPanel'), { ssr: false });
const PortfolioEditor = dynamic(() => import('@/components/PortfolioEditor'), { ssr: false });
const EditBookingDetails = dynamic(() => import('@/components/EditBookingDetails'), { ssr: false });
const DashboardSettingsHub = dynamic(() => import('@/components/DashboardSettingsHub'), { ssr: false });
const ShowcaseStudio = dynamic(() => import('@/components/ShowcaseStudio'), { ssr: false });
const ProfileGameScores = dynamic(() => import('@/components/ProfileGameScores'), { ssr: false });
const ProfilePreviewModal = dynamic(() => import('@/components/ProfilePreviewModal'), { ssr: false });
const ProfileGuides = dynamic(() => import('@/components/ProfileGuides'), { ssr: false });
const PersonalGalleryEditor = dynamic(() => import('@/components/PersonalGalleryEditor'), { ssr: false });
const ReputationHistoryModal = dynamic(() => import('@/components/ReputationHistoryModal'), { ssr: false });
const EcoPointsPanel = dynamic(() => import('@/components/EcoPointsPanel'), { ssr: false });
const ReferralPanel = dynamic(() => import('@/components/ReferralPanel'), { ssr: false });
const CollectiblesPanel = dynamic(() => import('@/components/CollectiblesPanel'), { ssr: false });
const ShopCollectiblesLazy = dynamic(() => import('@/components/ShopCollectiblesLazy'), { ssr: false });
const AwardsPanel = dynamic(() => import('@/components/AwardsPanel'), { ssr: false });

export type DashboardView =
  | 'overview'
  | 'achievements'
  | 'portfolio'
  | 'awards'
  | 'applications'
  | 'edit'
  | 'settings'
  | 'shop'
  | 'referrals'
  | 'guides'
  | 'games'
  | 'showcase';

type DashboardClientProps = {
  view?: DashboardView;
};

function DashboardInner({ view = 'overview' }: DashboardClientProps) {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const searchParams = useSafeSearchParams();
  const activeTab =
    view === 'overview' || view === 'edit' || view === 'settings'
      ? 'profile'
      : view;
  const [bookings, setBookings] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [vacancyApplications, setVacancyApplications] = useState<any[]>([]);
  const [participations, setParticipations] = useState<any[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profile, setProfile] = useState<{
    id?: string;
    publicCode?: string | null;
    nickname?: string | null;
    name?: string;
    email?: string;
    phone?: string;
    image?: string;
    socialScore?: number;
    ecoPoints?: number;
    reliabilityScore?: number;
    reliabilityPercent?: number | null;
    reliabilityLabel?: string;
    attendedCount?: number;
    noShowCount?: number;
    privacyAcceptedAt?: string | null;
    privacyFirstAcceptedAt?: string | null;
    privacyRefusedAt?: string | null;
    privacyPolicyVersion?: string | null;
    privacySignature?: string | null;
    cookiesAcceptedAt?: string | null;
    cookiesPolicyVersion?: string | null;
    cookiesSignature?: string | null;
    rulesAcceptedAt?: string | null;
    rulesPolicyVersion?: string | null;
    rulesSignature?: string | null;
    deletionRequestedAt?: string | null;
    deletionEffectiveAt?: string | null;
    birthDate?: string | null;
    gender?: 'MALE' | 'FEMALE' | null;
    bio?: string | null;
    city?: string | null;
    about?: string | null;
    hobbies?: string[];
    interests?: string[];
    zodiac?: string | null;
    instructionsVersion?: string | null;
    instructionsCompletedAt?: string | null;
    showcaseBadges?: string[] | null;
    profileVisibility?: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
    friendInviteToken?: string | null;
    steamUrl?: string | null;
    vkUrl?: string | null;
    telegramUrl?: string | null;
    telegramChatId?: string | null;
    maxUserId?: string | null;
    maxUrl?: string | null;
  } | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [bookingBusyId, setBookingBusyId] = useState<string | null>(null);
  const [profileHobbies, setProfileHobbies] = useState<string[]>([]);
  const [profileInterests, setProfileInterests] = useState<string[]>([]);
  const [profileBirthDate, setProfileBirthDate] = useState('');
  const [profileGender, setProfileGender] = useState<'' | 'MALE' | 'FEMALE'>('');
  const [profileVisibility, setProfileVisibility] = useState<'PUBLIC' | 'FRIENDS' | 'PRIVATE'>('PUBLIC');
  const [onlineVisibility, setOnlineVisibility] = useState<'FRIENDS' | 'PUBLIC' | 'HIDDEN'>('FRIENDS');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarName, setAvatarName] = useState('');
  const [appsSubTab, setAppsSubTab] = useState<'projects' | 'clubs' | 'programs' | 'events' | 'spaces'>('projects');
  const [achievementLegend, setAchievementLegend] = useState(false);
  const [modernUserBadge, setModernUserBadge] = useState(false);
  const [repModalOpen, setRepModalOpen] = useState(false);
  const [repModalTab, setRepModalTab] = useState<'LEVEL' | 'AUTHORITY' | 'SOCIAL' | 'ECO'>('AUTHORITY');
  const [moduleFlags, setModuleFlags] = useState<Record<string, boolean> | null>(null);
  const [levelMeta, setLevelMeta] = useState<{
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
  }>({
    level: 1,
    title: 'Новичок',
    color: '#94a3b8',
    pct: 0,
  });
  const modOn = useCallback(
    (key: string) => moduleFlags == null || moduleFlags[key] !== false,
    [moduleFlags]
  );
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const setEcoBalance = useCallback((ecoPoints: number) => {
    setProfile((prev) => {
      if (!prev) return prev;
      if (prev.ecoPoints === ecoPoints) return prev;
      return { ...prev, ecoPoints };
    });
  }, []);
  const openRepModal = (tab: 'LEVEL' | 'AUTHORITY' | 'SOCIAL' | 'ECO') => {
    setRepModalTab(tab);
    setRepModalOpen(true);
  };

  useEffect(() => {
    fetchPublicStatusCached()
      .then((d) => {
        if (d?.modules && typeof d.modules === 'object') setModuleFlags(d.modules as Record<string, boolean>);
        else setModuleFlags({});
      })
      .catch(() => setModuleFlags({}));
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) return;
    if (moduleFlags == null) return;
    if (moduleFlags.messaging === false) return;
    let cancelled = false;
    const loadUnread = () => {
      if (document.visibilityState === 'hidden') return;
      void cabinetGet('/api/messages?lite=1', moduleFlags == null || moduleFlags.messaging !== false).then((d) => {
        if (cancelled || typeof d?.unreadTotal !== 'number') return;
        setUnreadMessages(d.unreadTotal);
      });
    };
    loadUnread();
    const t = window.setInterval(loadUnread, 90_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [status, session?.user?.id, moduleFlags]);

  // TECH works only in /ops — hide cabinet surface from staff admins' mental model
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'TECH') {
      router.replace('/ops');
    }
  }, [status, session?.user?.role, router]);

  // If dedicated view is off in Ops — bounce to overview
  useEffect(() => {
    if (!moduleFlags) return;
    if (view === 'achievements' && moduleFlags.achievements === false) router.replace('/dashboard');
    if (view === 'awards' && moduleFlags.achievements === false) router.replace('/dashboard');
    if (view === 'portfolio' && moduleFlags.portfolio === false) router.replace('/dashboard');
    if (view === 'shop' && moduleFlags.eco === false) router.replace('/dashboard');
    if (view === 'games' && moduleFlags.games === false) router.replace('/dashboard');
    if (view === 'applications' && moduleFlags.applications === false) router.replace('/dashboard');
    if (view === 'referrals' && moduleFlags.referrals === false) router.replace('/dashboard');
  }, [moduleFlags, view, router]);



  // Thin compatibility redirects from legacy ?tab= / ?section= query URLs
  useEffect(() => {
    if (view !== 'overview') return;
    const tab = searchParams.get('tab');
    const section = searchParams.get('section');
    if (tab === 'tickets') {
      router.replace('/tickets');
      return;
    }
    if (tab === 'achievements') {
      router.replace('/dashboard/achievements');
      return;
    }
    if (tab === 'portfolio') {
      router.replace('/dashboard/portfolio');
      return;
    }
    if (tab === 'applications') {
      router.replace('/dashboard/applications');
      return;
    }
    if (tab === 'profile' && section === 'edit') {
      setEditOpen(true);
      router.replace('/dashboard#profile-edit');
      return;
    }
    if (tab === 'profile' && section === 'settings') {
      router.replace('/dashboard/settings');
      return;
    }
    if (tab === 'profile' && (section === 'overview' || !section)) {
      router.replace('/dashboard');
    }
  }, [searchParams, router, view]);

  const projectApplications = useMemo(
    () => applications.filter((app) => app.project),
    [applications]
  );
  const clubApplications = useMemo(
    () => applications.filter((app) => app.club && !app.project),
    [applications]
  );
  const programApplications = useMemo(
    () => applications.filter((app) => app.program),
    [applications]
  );

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    const onDone = () => setModernUserBadge(true);
    window.addEventListener(QUICK_ACCESS_TUTORIAL_DONE_EVENT, onDone);
    return () => window.removeEventListener(QUICK_ACCESS_TUTORIAL_DONE_EVENT, onDone);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status !== 'authenticated') return;
    // @ts-ignore
    if (session?.user?.role === 'SCANNER') {
      router.push('/scanner');
      return;
    }
    if (moduleFlags == null) return;

    let cancelled = false;
    const on = (key: string) => moduleFlags[key] !== false;

    void (async () => {
      if (on('events')) {
        const data = await cabinetGet('/api/user/bookings');
        if (!cancelled && Array.isArray(data)) setBookings(data);
      }
      if (on('vacancies')) {
        const d = await cabinetGet('/api/vacancies/apply');
        if (!cancelled) setVacancyApplications(Array.isArray(d?.items) ? d.items : []);
      }
      if (on('applications')) {
        const data = await cabinetGet('/api/user/applications');
        if (!cancelled && Array.isArray(data)) setApplications(data);
      }
      if (on('events')) {
        const data = await cabinetGet('/api/user/participations');
        if (!cancelled && Array.isArray(data)) setParticipations(data);
      }
      try {
        const data: any = await fetchProfileCached();
        if (cancelled || !data?.id) return;
        setProfile(data);
        setProfileHobbies(Array.isArray(data.hobbies) ? data.hobbies : []);
        setProfileInterests(Array.isArray(data.interests) ? data.interests : []);
        setProfileBirthDate(data.birthDate ? String(data.birthDate).slice(0, 10) : '');
        setProfileGender(data.gender === 'MALE' || data.gender === 'FEMALE' ? data.gender : '');
        if (data.profileVisibility === 'FRIENDS' || data.profileVisibility === 'PRIVATE') {
          setProfileVisibility(data.profileVisibility);
        }
        if (data.onlineVisibility === 'PUBLIC' || data.onlineVisibility === 'HIDDEN' || data.onlineVisibility === 'FRIENDS') {
          setOnlineVisibility(data.onlineVisibility);
        } else {
          setOnlineVisibility('FRIENDS');
        }
        if (data.profileVisibility === 'PUBLIC') {
          setProfileVisibility('PUBLIC');
        }
      } catch {
        /* toast handled in cabinet-fetch */
      }
      if (on('achievements')) {
        const data = await cabinetGet('/api/user/achievements?lite=1');
        if (cancelled) return;
        if (data?.progress?.complete || data?.legend) setAchievementLegend(true);
        const hasModern = Array.isArray(data?.items)
          ? data.items.some((i: { code?: string; unlocked?: boolean }) => i.code === 'MODERN_USER' && i.unlocked)
          : Boolean(data?.modernUser);
        setModernUserBadge(hasModern);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, router, session?.user?.role, moduleFlags]);


  const refreshProfileLive = useCallback((force = false) => {
    fetchProfileCached(force)
      .then((data: any) => {
        if (data?.id) {
          setProfile(data);
          setProfileHobbies(Array.isArray(data.hobbies) ? data.hobbies : []);
          setProfileInterests(Array.isArray(data.interests) ? data.interests : []);
          setProfileBirthDate(data.birthDate ? String(data.birthDate).slice(0, 10) : '');
          setProfileGender(data.gender === 'MALE' || data.gender === 'FEMALE' ? data.gender : '');
          if (data.levelProgress) {
            const lp = data.levelProgress;
            setLevelMeta({
              level: data.level || lp.current || 1,
              title: lp.title || 'Новичок',
              color: lp.color || '#94a3b8',
              pct: typeof lp.percentToNext === 'number' ? lp.percentToNext : 0,
              blurb: lp.blurb || undefined,
              bandTitle: lp.bandTitle || undefined,
              bandId: lp.bandId || undefined,
              toNext: typeof lp.toNext === 'number' ? lp.toNext : null,
              nextReward: lp.nextReward || null,
              prestige: lp.prestige || null,
            });
          }
          if (data.profileVisibility === 'FRIENDS' || data.profileVisibility === 'PRIVATE') {
            setProfileVisibility(data.profileVisibility);
          }
          if (
            data.onlineVisibility === 'PUBLIC' ||
            data.onlineVisibility === 'HIDDEN' ||
            data.onlineVisibility === 'FRIENDS'
          ) {
            setOnlineVisibility(data.onlineVisibility);
          }
        }
      })
      .catch(() => undefined);
    fetchEcoCached(force)
      .then((d: any) => {
        const lvl = d?.level?.level;
        if (!lvl) return;
        setLevelMeta({
          level: lvl.level || 1,
          title: lvl.title || 'Новичок',
          color: lvl.color || '#94a3b8',
          pct: typeof d.level?.pct === 'number' ? d.level.pct : 0,
          blurb: lvl.blurb || undefined,
          bandTitle: d.level?.band?.title || undefined,
          bandId: d.level?.band?.id || lvl.band || undefined,
          toNext: typeof d.level?.toNext === 'number' ? d.level.toNext : null,
          nextReward: d.level?.nextReward || null,
          prestige: d.level?.prestige || null,
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    refreshProfileLive();
    // Debounced visibility refresh — cache TTL absorbs focus spam
    let t: ReturnType<typeof setTimeout> | null = null;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (t) clearTimeout(t);
      t = setTimeout(() => refreshProfileLive(false), 2500);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (t) clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [status, refreshProfileLive]);

  useEffect(() => {
    if (activeTab === 'profile') refreshProfileLive();
  }, [activeTab, refreshProfileLive]);


  const upcomingTickets = useMemo(() => {
    const now = Date.now();
    return [...participations]
      .filter((p) => p?.booking?.endTime && new Date(p.booking.endTime).getTime() >= now - 6 * 3600000)
      .sort(
        (a, b) => new Date(a.booking.startTime).getTime() - new Date(b.booking.startTime).getTime()
      );
  }, [participations]);

  useEffect(() => {
    if (!selectedTicket && upcomingTickets[0]?.ticketCode) {
      setSelectedTicket(upcomingTickets[0].ticketCode);
    }
  }, [upcomingTickets, selectedTicket]);

  const refreshParticipations = async () => {
    const res = await fetch('/api/user/participations');
    const data = await res.json();
    if (Array.isArray(data)) setParticipations(data);
  };

  const refreshBookings = async () => {
    const res = await fetch('/api/user/bookings');
    const data = await res.json();
    if (Array.isArray(data)) setBookings(data);
  };

  const cancelParticipation = async (bookingId: string) => {
    if (!bookingId || ticketBusy) return;
    if (!window.confirm('Отменить участие в мероприятии? Билет станет недействительным.')) return;
    setTicketBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Не удалось отменить');
      toast.success(data.message || 'Участие отменено');
      setSelectedTicket(null);
      await refreshParticipations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setTicketBusy(false);
    }
  };

  const cancelSpaceBooking = async (bookingId: string) => {
    if (!bookingId || bookingBusyId) return;
    if (!window.confirm('Отменить бронь пространства?')) return;
    setBookingBusyId(bookingId);
    try {
      const res = await fetch(`/api/user/bookings/${bookingId}/cancel`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Не удалось отменить');
      toast.success(data.message || 'Бронь отменена');
      await refreshBookings();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBookingBusyId(null);
    }
  };

  // Must stay above any early return — otherwise React #310 when session finishes loading
  // (admin/user landing on /dashboard after login → «Упс»).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (status === 'loading' || !session) return;
    const applyHash = () => {
      const hash = window.location.hash;
      if (hash === '#profile-edit') {
        setPreviewOpen(false);
        setEditOpen(true);
        return;
      }
      if (hash === '#messengers' || hash === '#settings') {
        setEditOpen(false);
        setPreviewOpen(false);
        router.push(hash === '#messengers' ? '/dashboard/settings?section=messengers' : '/dashboard/settings');
        return;
      }
      if (hash === '#profile-hub') {
        document.getElementById('profile-hub')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [view, status, session, router]);

  useEffect(() => {
    if (view === 'edit') setEditOpen(true);
  }, [view]);

  useEffect(() => {
    if (!editOpen && !previewOpen) {
      document.body.classList.remove('yp-sheet-open');
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('yp-sheet-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setEditOpen(false);
      setPreviewOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove('yp-sheet-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [editOpen, previewOpen]);

  if (status === 'loading') {
    return (
      <div className="container dashboard-shell dashboard-shell--boot" aria-busy="true">
        <div className="svc-skel" aria-hidden>
          <div className="svc-skel__pill" />
          <div className="svc-skel__row" />
          <div className="svc-skel__row" />
        </div>
        <p className="svc-empty-inline">Открываем кабинет…</p>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="container yp-surface yp-guest-gate" style={{ margin: '2rem auto', maxWidth: 420, padding: '1.5rem', textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Войдите в кабинет</h2>
        <p style={{ color: 'var(--muted)' }}>Профиль, QR и записи доступны после входа.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
          <a href="/login?callbackUrl=%2Fdashboard" className="btn btn-primary">
            Войти
          </a>
          <a href="/register?callbackUrl=%2Fdashboard" className="btn btn-secondary">
            Регистрация
          </a>
        </div>
      </div>
    );
  }

  const goTab = (tab: string, section?: 'overview' | 'edit' | 'settings') => {
    if (tab === 'tickets') {
      router.push('/tickets');
      return;
    }
    if (tab === 'applications') {
      router.push('/dashboard/applications');
      return;
    }
    if (tab === 'achievements') {
      router.push('/dashboard/achievements');
      return;
    }
    if (tab === 'portfolio') {
      router.push('/dashboard/portfolio');
      return;
    }
    if (tab === 'profile') {
      if (section === 'edit') {
        setEditOpen(true);
        router.push('/dashboard#profile-edit');
        return;
      }
      if (section === 'settings') {
        router.push('/dashboard/settings');
        return;
      }
      router.push('/dashboard');
    }
  };

  const selected = upcomingTickets.find((p) => p.ticketCode === selectedTicket) || upcomingTickets[0];

  const legalName = (profile?.name || session?.user?.name || '').trim();
  const pendingModeration = Boolean(session?.user?.moderationPending);
  const roleBadge = pendingModeration
    ? 'Гость'
    : session?.user?.role
      ? roleLabelRu(session.user.role)
      : null;

  const isOverview = view === 'overview';
  const isSettings = view === 'settings';
  const hideAsideOnMobile = true;

  const roleHint = pendingModeration
    ? 'Просмотр сайта и кабинет доступны. Бронь и запись — после одобрения.'
    : session?.user?.role === 'MODERATOR'
      ? 'Быстрое действие: очередь модерации'
      : session?.user?.role === 'ADMIN'
        ? session.user.isSuperAdmin === false
          ? 'Администратор с ограниченными разделами'
          : 'Полный доступ к панели управления'
        : session?.user?.role === 'SCANNER'
          ? 'Быстрое действие: сканер QR'
          : 'Быстрые действия: заявки и брони';

  return (
    <div className="container dashboard-page">
      <EventSoonNotifier tickets={upcomingTickets} />
      {pendingModeration ? (
        <div
          role="status"
          style={{
            margin: '0 0 1rem',
            padding: '0.85rem 1rem',
            borderRadius: 12,
            background: 'color-mix(in srgb, #f59e0b 16%, #fff)',
            border: '1px solid color-mix(in srgb, #d97706 35%, transparent)',
            fontWeight: 650,
            lineHeight: 1.45,
          }}
        >
          Ваш аккаунт находится на проверке. Полный функционал будет доступен после одобрения администратором
        </div>
      ) : null}
      {isOverview ? (
        <header className="profile-page-head dashboard-hello">
          <div>
            {roleBadge ? (
              <p className={`dashboard-hello__role role-pill role-pill--${(session?.user?.role || 'USER').toLowerCase()}`}>
                {roleBadge}
              </p>
            ) : null}
            <h1 className="profile-view__title dashboard-hello__name">
              {legalName ? legalName.split(' ')[0] : 'Профиль'}
            </h1>
            <p className="profile-view__lead dashboard-hello__lead">{roleHint}</p>
          </div>
          {(session?.user?.role === 'ADMIN' || session?.user?.role === 'MODERATOR') && (
            <Link href="/admin" className="btn btn-secondary">
              Панель
            </Link>
          )}
        </header>
      ) : null}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div
          className={`dashboard-layout dashboard-shell${isOverview ? ' is-overview' : ''}${
            isSettings ? ' is-settings' : ''
          }${hideAsideOnMobile ? ' hide-aside-mobile' : ''}`}
        >
          <aside className="glass dashboard-aside dashboard-aside--nav" aria-label="Профиль">
            <nav className="dashboard-menu" aria-label="Меню профиля">
              {(
                [
                  {
                    group: 'Профиль',
                    items: [
                      { id: 'overview' as const, label: 'Профиль', icon: User, href: '/dashboard' },
                      { id: 'showcase' as const, label: 'Витрина', icon: LayoutGrid, href: '/dashboard/showcase' },
                      { id: 'settings' as const, label: 'Настройки', icon: Settings, href: '/dashboard/settings' },
                    ],
                  },
                  {
                    group: 'Кабинет',
                    items: [
                      { id: 'friends' as const, label: 'Друзья', icon: Users, href: '/friends', module: 'friends' },
                      { id: 'messages' as const, label: 'Сообщения', icon: MessageCircle, href: '/messages', module: 'messaging' },
                      { id: 'tickets' as const, label: 'Билеты', icon: Ticket, href: '/tickets', module: 'events' },
                      { id: 'applications' as const, label: 'Заявки', icon: FileText, href: '/dashboard/applications', module: 'applications' },
                      { id: 'portfolio' as const, label: 'Портфолио', icon: Briefcase, href: '/dashboard/portfolio', module: 'portfolio' },
                      { id: 'referrals' as const, label: 'Рефералы', icon: Gift, href: '/dashboard/referrals', module: 'referrals' },
                      { id: 'guides' as const, label: 'Инструктажи', icon: BookOpen, href: '/dashboard/guides' },
                      { id: 'games' as const, label: 'Игры', icon: Gamepad2, href: '/dashboard/games', module: 'games' },
                    ],
                  },
                  {
                    group: 'Прогресс',
                    items: [
                      { id: 'shop' as const, label: 'Магазин', icon: ShoppingBag, href: '/dashboard/shop', module: 'eco' },
                      { id: 'achievements' as const, label: 'Достижения', icon: Award, href: '/dashboard/achievements', module: 'achievements' },
                      { id: 'awards' as const, label: 'Награды', icon: Medal, href: '/dashboard/awards', module: 'achievements' },
                    ],
                  },
                ] as const
              ).map((section) => {
                const items = section.items.filter(
                  (item) => !('module' in item && item.module) || modOn((item as { module?: string }).module || '')
                );
                if (!items.length) return null;
                return (
                  <div key={section.group} className="dashboard-menu__group">
                    <p className="dashboard-aside-nav-label">{section.group}</p>
                    <div className="dashboard-nav dashboard-nav--labeled">
                      {items.map((item) => {
                        const active =
                          item.id === 'overview'
                            ? view === 'overview' || view === 'edit'
                            : item.id !== 'tickets' &&
                              item.id !== 'messages' &&
                              item.id !== 'friends' &&
                              view === item.id;
                        const className = `dashboard-nav-btn${active ? ' is-active' : ''}${
                          item.id === 'achievements' ? ' is-achievements' : ''
                        }`;
                        return (
                          <Link
                            key={item.id}
                            href={item.href}
                            title={item.label}
                            aria-label={item.label}
                            className={className}
                          >
                            <span className="dashboard-nav-icon-wrap">
                              <item.icon size={17} />
                              {item.id === 'tickets' && upcomingTickets.length > 0 && (
                                <span className="dashboard-nav-badge">
                                  {upcomingTickets.length > 999 ? '999+' : upcomingTickets.length}
                                </span>
                              )}
                              {item.id === 'messages' && unreadMessages > 0 && (
                                <span className="dashboard-nav-badge">
                                  {unreadMessages > 99 ? '99+' : unreadMessages}
                                </span>
                              )}
                              {item.id === 'achievements' && achievementLegend && (
                                <Crown size={11} color="#ca8a04" className="dashboard-nav-crown" aria-hidden />
                              )}
                            </span>
                            <span className="dashboard-nav-label">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>

            <div className="dashboard-aside-foot">
              {modOn('eco') ? (
                <Link href="/dashboard/shop" className="dashboard-aside-eco" title="Ваш баланс мбаллов">
                  <Leaf size={15} />
                  <span>мб</span>
                  <strong>{(profile?.ecoPoints ?? 0).toLocaleString('ru-RU')}</strong>
                </Link>
              ) : null}
              <Link href="/" className="dashboard-aside-foot-link dashboard-aside-foot-link--home">
                <Home size={16} /> На главную
              </Link>
              {(session.user?.role === 'ADMIN' || session.user?.role === 'MODERATOR') && (
                <Link href="/admin" className="dashboard-admin-btn">
                  <Shield size={16} /> Панель
                </Link>
              )}
              <button
                type="button"
                className="dashboard-aside-foot-link dashboard-aside-foot-link--logout"
                onClick={() => void signOutLogged({ callbackUrl: '/' })}
              >
                <LogOut size={16} /> Выйти
              </button>
            </div>
          </aside>

                    <div className="glass dashboard-main">
            {view === 'applications' && (
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.85rem', fontWeight: 700 }}>Мои заявки</h2>
                {vacancyApplications.length > 0 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>Мои отклики на вакансии</h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                      {vacancyApplications.map((va: any) => (
                        <li key={va.id} className="card-surface" style={{ padding: '0.75rem 1rem' }}>
                          <a href={`/vacancies/${va.vacancy?.id}`} style={{ fontWeight: 700 }}>
                            {va.vacancy?.title || 'Вакансия'}
                          </a>
                          <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                            {va.vacancy?.employer?.title} ·{' '}
                            {{
                              PENDING: 'Черновик',
                              SCREENING: 'Предотбор',
                              PENDING_REVIEW: 'На рассмотрении',
                              APPROVED: 'Принято',
                              REJECTED: 'Отклонено',
                              WITHDRAWN: 'Отозвано',
                            }[va.status as string] || 'Неизвестно'}
                            {va.autoScore != null ? ` · предотбор ${va.autoScore}%` : ''}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(() => {
                  const statusBadge = (status: string) => {
                    const pending = status === 'PENDING';
                    const approved = status === 'APPROVED';
                    return (
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: pending ? '#fef3c7' : approved ? '#dcfce7' : '#fee2e2',
                          color: pending ? '#d97706' : approved ? '#166534' : '#991b1b',
                        }}
                      >
                        {pending ? 'На модерации' : approved ? 'Одобрено' : 'Отклонено'}
                      </span>
                    );
                  };

                  const rejectNote = (reason?: string | null) =>
                    reason ? (
                      <p
                        style={{
                          margin: '0.65rem 0 0',
                          padding: '0.55rem 0.7rem',
                          borderRadius: 8,
                          background: '#fef2f2',
                          border: '1px solid rgba(153,27,27,0.15)',
                          color: '#991b1b',
                          fontSize: '0.85rem',
                          lineHeight: 1.4,
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>Причина: </span>
                        {reason}
                      </p>
                    ) : null;

                  const emptyBox = (text: string, href?: string, linkLabel?: string) => (
                    <div
                      style={{
                        padding: '1.25rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'rgba(0,0,0,0.02)',
                        textAlign: 'center',
                      }}
                    >
                      <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: href ? '0 0 0.85rem' : 0 }}>
                        {text}
                      </p>
                      {href && linkLabel && (
                        <a href={href} className="btn btn-primary" style={{ display: 'inline-block' }}>
                          {linkLabel}
                        </a>
                      )}
                    </div>
                  );

                  const subTabs = [
                    {
                      id: 'projects' as const,
                      label: 'Проекты',
                      icon: FolderKanban,
                      count: projectApplications.length,
                    },
                    { id: 'clubs' as const, label: 'Клубы', icon: Users, count: clubApplications.length },
                    {
                      id: 'programs' as const,
                      label: 'Программы',
                      icon: HandHeart,
                      count: programApplications.length,
                    },
                    {
                      id: 'events' as const,
                      label: 'Афиша',
                      icon: CalendarDays,
                      count: participations.length,
                    },
                    { id: 'spaces' as const, label: 'Брони', icon: Building2, count: bookings.length },
                  ];

                  return (
                    <>
                      <div role="tablist" aria-label="Тип заявок" className="dashboard-apps-tabs">
                        {subTabs.map((tab) => {
                          const active = appsSubTab === tab.id;
                          const Icon = tab.icon;
                          const tip =
                            tab.id === 'spaces'
                              ? 'Бронирование пространств'
                              : tab.id === 'events'
                                ? 'Мероприятия афиши'
                                : tab.id === 'programs'
                                  ? 'Гранты, добро, самоуправление'
                                  : tab.label;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              aria-label={tip}
                              title={tip}
                              onClick={() => setAppsSubTab(tab.id)}
                              className={`dashboard-apps-tab is-icon-only${active ? ' is-active' : ''}`}
                            >
                              <span className="dashboard-apps-tab-icon">
                                <Icon size={18} aria-hidden />
                                {tab.count > 0 && (
                                  <span
                                    className="dashboard-apps-tab-count"
                                    style={{
                                      background: active ? 'var(--primary)' : 'rgba(15,23,42,0.08)',
                                      color: active ? '#fff' : '#475569',
                                    }}
                                  >
                                    {tab.count > 99 ? '99+' : tab.count}
                                  </span>
                                )}
                              </span>
                              <span className="dashboard-apps-tab-label">{tab.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="dashboard-apps-tabs-hint" aria-live="polite">
                        {subTabs.find((t) => t.id === appsSubTab)?.label ?? 'Заявки'}
                      </p>

                      {appsSubTab === 'projects' &&
                        (projectApplications.length === 0
                          ? emptyBox('Пока нет заявок в проекты', '/projects', 'Смотреть проекты')
                          : (
                            <div className="dashboard-apps-grid">
                              {projectApplications.map((app) => (
                                <a
                                  key={app.id}
                                  href={`/projects/${encodeURIComponent(app.project.id)}`}
                                  style={{
                                    padding: '1.25rem',
                                    border: '1px solid rgba(0,0,0,0.08)',
                                    borderRadius: 'var(--radius-md)',
                                    backgroundColor: 'white',
                                    textDecoration: 'none',
                                    color: 'inherit',
                                  }}
                                >
                                  <h4 style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>
                                    {app.project.title}
                                  </h4>
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                    }}
                                  >
                                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                                      {new Date(app.createdAt).toLocaleDateString()}
                                    </span>
                                    {statusBadge(app.status)}
                                  </div>
                                  {app.status === 'REJECTED' ? rejectNote(app.rejectReason) : null}
                                </a>
                              ))}
                            </div>
                          ))}

                      {appsSubTab === 'clubs' &&
                        (clubApplications.length === 0
                          ? emptyBox('Пока нет заявок в клубы', '/clubs', 'Смотреть клубы')
                          : (
                            <div className="dashboard-apps-grid">
                              {clubApplications.map((app) => (
                                <a
                                  key={app.id}
                                  href={`/clubs/${encodeURIComponent(app.club.id)}`}
                                  style={{
                                    padding: '1.25rem',
                                    border: '1px solid rgba(0,0,0,0.08)',
                                    borderRadius: 'var(--radius-md)',
                                    backgroundColor: 'white',
                                    textDecoration: 'none',
                                    color: 'inherit',
                                  }}
                                >
                                  <h4 style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>
                                    {app.club.title}
                                  </h4>
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                    }}
                                  >
                                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                                      {new Date(app.createdAt).toLocaleDateString()}
                                    </span>
                                    {statusBadge(app.status)}
                                  </div>
                                  {app.status === 'REJECTED' ? rejectNote(app.rejectReason) : null}
                                </a>
                              ))}
                            </div>
                          ))}

                      {appsSubTab === 'programs' &&
                        (programApplications.length === 0
                          ? emptyBox('Пока нет заявок в гранты, добро и самоуправление', '/grants', 'Смотреть гранты')
                          : (
                            <div className="dashboard-apps-grid">
                              {programApplications.map((app) => {
                                const kind = app.program?.kind;
                                const href =
                                  kind === 'DOBRO'
                                    ? `/dobro/${app.program.id}`
                                    : kind === 'SELF_GOV'
                                      ? `/self-gov/${app.program.id}`
                                      : `/grants/${app.program.id}`;
                                const kindLabel =
                                  kind === 'DOBRO'
                                    ? 'Добро'
                                    : kind === 'SELF_GOV'
                                      ? 'Самоуправление'
                                      : 'Грант';
                                return (
                                  <a
                                    key={app.id}
                                    href={href}
                                    style={{
                                      padding: '1.25rem',
                                      border: '1px solid rgba(0,0,0,0.08)',
                                      borderRadius: 'var(--radius-md)',
                                      backgroundColor: 'white',
                                      textDecoration: 'none',
                                      color: 'inherit',
                                    }}
                                  >
                                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>
                                      {kindLabel}
                                    </div>
                                    <h4 style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>
                                      {app.program.title}
                                    </h4>
                                    <div
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                      }}
                                    >
                                      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                                        {new Date(app.createdAt).toLocaleDateString()}
                                      </span>
                                      {statusBadge(app.status)}
                                    </div>
                                    {app.status === 'REJECTED' ? rejectNote(app.rejectReason) : null}
                                  </a>
                                );
                              })}
                            </div>
                          ))}

                      {appsSubTab === 'events' &&
                        (participations.length === 0
                          ? emptyBox('Пока нет записей на мероприятия', '/events', 'Открыть афишу')
                          : (
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'flex-end',
                                  marginBottom: '0.85rem',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => router.push('/tickets')}
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
                                >
                                  Открыть билеты
                                </button>
                              </div>
                              <div className="dashboard-apps-grid">
                                {participations.map((part: any) => {
                                  const b = part.booking;
                                  const ended = b?.endTime && new Date(b.endTime).getTime() < Date.now();
                                  return (
                                    <div
                                      key={part.id}
                                      style={{
                                        padding: '1.25rem',
                                        border: '1px solid rgba(0,0,0,0.08)',
                                        borderRadius: 'var(--radius-md)',
                                        backgroundColor: 'white',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.85rem',
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedTicket(part.ticketCode);
                                          router.push('/tickets');
                                        }}
                                        style={{
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          gap: '1rem',
                                          textAlign: 'left',
                                          cursor: 'pointer',
                                          border: 'none',
                                          background: 'transparent',
                                          padding: 0,
                                          font: 'inherit',
                                          color: 'inherit',
                                          width: '100%',
                                        }}
                                      >
                                        <div style={{ minWidth: 0 }}>
                                          <h4
                                            style={{
                                              fontWeight: 600,
                                              fontSize: '1rem',
                                              marginBottom: '0.25rem',
                                            }}
                                          >
                                            {b.title}
                                          </h4>
                                          <p
                                            style={{
                                              color: 'var(--primary)',
                                              fontSize: '0.85rem',
                                              marginBottom: '0.75rem',
                                              fontWeight: 500,
                                            }}
                                          >
                                            {b.space?.title || 'Без площадки'}
                                          </p>
                                          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                                            {formatMskDate(b.startTime, { day: 'numeric', month: 'short' })}{' '}
                                            {formatMskTime(b.startTime)} (МСК)
                                          </span>
                                          <div
                                            style={{
                                              marginTop: 8,
                                              fontSize: '0.78rem',
                                              fontWeight: 600,
                                              color: 'var(--primary)',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 4,
                                            }}
                                          >
                                            Открыть билет <ChevronRight size={14} />
                                          </div>
                                        </div>
                                        <div style={{ flexShrink: 0, textAlign: 'center' }}>
                                          <QRCodeDisplay value={part.ticketCode || ''} />
                                          <div
                                            style={{
                                              fontSize: '0.7rem',
                                              color: 'var(--muted)',
                                              marginTop: '0.25rem',
                                            }}
                                          >
                                            Билет
                                          </div>
                                        </div>
                                      </button>
                                      {!ended && (
                                        <button
                                          type="button"
                                          onClick={() => cancelParticipation(b.id)}
                                          disabled={ticketBusy}
                                          style={{
                                            alignSelf: 'flex-start',
                                            border: '1px solid rgba(185,28,28,0.25)',
                                            background: 'rgba(254,226,226,0.45)',
                                            color: '#b91c1c',
                                            borderRadius: 10,
                                            padding: '0.45rem 0.75rem',
                                            fontSize: '0.82rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                          }}
                                        >
                                          <Ban size={14} />
                                          Отменить запись
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}

                      {appsSubTab === 'spaces' &&
                        (bookings.length === 0
                          ? emptyBox(
                              'Пока нет бронирований пространств',
                              '/spaces',
                              'Смотреть пространства'
                            )
                          : (
                            <div className="dashboard-apps-grid">
                              {bookings.map((booking) => {
                                const canCancel =
                                  booking.status !== 'REJECTED' &&
                                  booking.endTime &&
                                  new Date(booking.endTime).getTime() >= Date.now();
                                return (
                                  <div
                                    key={booking.id}
                                    style={{
                                      padding: '1.25rem',
                                      border: '1px solid rgba(0,0,0,0.08)',
                                      borderRadius: 'var(--radius-md)',
                                      backgroundColor: 'white',
                                    }}
                                  >
                                    <h4
                                      style={{
                                        fontWeight: 600,
                                        fontSize: '1rem',
                                        marginBottom: '0.25rem',
                                      }}
                                    >
                                      {booking.title}
                                    </h4>
                                    <p
                                      style={{
                                        color: 'var(--primary)',
                                        fontSize: '0.85rem',
                                        marginBottom: '0.75rem',
                                        fontWeight: 500,
                                      }}
                                    >
                                      {booking.space?.title}
                                    </p>
                                    <div
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        flexWrap: 'wrap',
                                      }}
                                    >
                                      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                                        {formatMskDate(booking.startTime, { day: 'numeric', month: 'short' })}{' '}
                                        {formatMskTime(booking.startTime)} (МСК)
                                      </span>
                                      {statusBadge(booking.status)}
                                    </div>
                                    {booking.status === 'REJECTED' ? rejectNote(booking.rejectReason) : null}
                                    {booking.description ? (
                                      <p
                                        style={{
                                          margin: '0.65rem 0 0',
                                          fontSize: '0.82rem',
                                          color: '#64748b',
                                          lineHeight: 1.4,
                                          display: '-webkit-box',
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden',
                                        }}
                                      >
                                        {booking.description}
                                      </p>
                                    ) : (
                                      <p style={{ margin: '0.65rem 0 0', fontSize: '0.78rem', color: '#b45309' }}>
                                        Добавьте анонс — в афише пока только название
                                      </p>
                                    )}
                                    {canCancel && (
                                      <>
                                        <EditBookingDetails
                                          booking={booking}
                                          onSaved={(next) => {
                                            setBookings((prev) =>
                                              prev.map((b) => (b.id === next.id ? { ...b, ...next } : b))
                                            );
                                          }}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => cancelSpaceBooking(booking.id)}
                                          disabled={bookingBusyId === booking.id}
                                          style={{
                                            marginTop: 8,
                                            border: '1px solid rgba(185,28,28,0.25)',
                                            background: 'rgba(254,226,226,0.45)',
                                            color: '#b91c1c',
                                            borderRadius: 10,
                                            padding: '0.45rem 0.75rem',
                                            fontSize: '0.82rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                          }}
                                        >
                                          <Ban size={14} />
                                          {bookingBusyId === booking.id ? 'Отмена…' : 'Отменить бронь'}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                    </>
                  );
                })()}
              </>
            )}

            {view === 'achievements' && (
              <div style={{ maxWidth: "100%", width: "100%" }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginBottom: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 800 }}>Достижения</h2>
                  <button
                    type="button"
                    onClick={() => goTab('profile', 'edit')}
                    style={{ border: 0, background: 'transparent', color: 'var(--muted)', fontSize: '0.78rem', fontWeight: 650, cursor: 'pointer' }}
                  >
                    Профиль →
                  </button>
                </div>
                <AchievementsPanel
                  onProgress={(p) => {
                    if (p.complete || p.legend) setAchievementLegend(true);
                  }}
                />
              </div>
            )}

            {view === 'showcase' && (
              <div className="profile-view">
                <div className="profile-page-head">
                  <div>
                    <h2 className="profile-view__title">Витрина профиля</h2>
                    <p className="profile-view__lead">
                      Значки и коллекционные карты, которые видят другие на вашей публичной странице.
                    </p>
                  </div>
                  <Link href="/dashboard" className="btn btn-secondary">К профилю</Link>
                </div>
                <ShowcaseStudio
                  showcaseStored={profile?.showcaseBadges}
                  onSaved={(codes) =>
                    setProfile((prev) => (prev ? { ...prev, showcaseBadges: codes } : prev))
                  }
                />
                <div style={{ marginTop: '1rem' }}>
                  <CollectiblesPanel onBalanceChange={setEcoBalance} />
                </div>
                {profile?.publicCode || session.user?.id ? (
                  <p className="settings-hub-foot" style={{ marginTop: '1rem' }}>
                    Публичный вид:{' '}
                    <Link
                      href={`/u/${encodeURIComponent(String(profile?.publicCode || session.user?.id))}`}
                    >
                      открыть профиль
                    </Link>
                  </p>
                ) : null}
              </div>
            )}

            {view === 'referrals' && (
              <div className="profile-view">
                <div className="profile-page-head">
                  <div>
                    <h2 className="profile-view__title">Рефералы</h2>
                    <p className="profile-view__lead">Приглашайте друзей и получайте бонусы за регистрации и визиты.</p>
                  </div>
                  <Link href="/dashboard" className="btn btn-secondary">К профилю</Link>
                </div>
                <ReferralPanel />
              </div>
            )}

            {view === 'guides' && (
              <div className="profile-view">
                <div className="profile-page-head">
                  <div>
                    <h2 className="profile-view__title">Инструктажи</h2>
                    <p className="profile-view__lead">Обучение работе с порталом и обязательные инструкции.</p>
                  </div>
                  <Link href="/dashboard" className="btn btn-secondary">К профилю</Link>
                </div>
                <ProfileGuides
                  instructionsVersion={profile?.instructionsVersion}
                  instructionsCompletedAt={profile?.instructionsCompletedAt}
                  onInstructionsSync={(state) => {
                    setProfile((prev) =>
                      prev
                        ? {
                            ...prev,
                            instructionsVersion: state.completed ? state.version : null,
                            instructionsCompletedAt: state.completedAt ?? null,
                          }
                        : prev
                    );
                    if (state.completed) {
                      setModernUserBadge(true);
                      fetch('/api/user/achievements?lite=1')
                        .then((r) => readCabinetJson(r))
                        .then((data) => {
                          if (data?.legend) setAchievementLegend(true);
                        })
                        .catch(() => undefined);
                    }
                  }}
                />
              </div>
            )}

            {view === 'games' && (
              <div className="profile-view">
                <div className="profile-page-head">
                  <div>
                    <h2 className="profile-view__title">Игры и рекорды</h2>
                    <p className="profile-view__lead">Ваши результаты в мини-играх портала.</p>
                  </div>
                  <Link href="/dashboard" className="btn btn-secondary">К профилю</Link>
                </div>
                <ProfileGameScores />
              </div>
            )}

            {view === 'shop' && (
              <div className="profile-view profile-shop">
                <h2 className="profile-view__title">Магазин</h2>
                <p className="profile-view__lead">
                  Тратьте мбаллы на рамки, ауры, темы и голос. Покупка сразу надевается на профиль.
                </p>
                <EcoPointsPanel
                  mode="shop"
                  onBalanceChange={setEcoBalance}
                />
                <ShopCollectiblesLazy onBalanceChange={setEcoBalance} />
              </div>
            )}

            {view === 'awards' && (
              <div className="profile-view">
                <h2 className="profile-view__title">Награды</h2>
                <p className="profile-view__lead">
                  Официальные дипломы, сертификаты и грамоты портала.
                </p>
                <AwardsPanel />
              </div>
            )}

            {view === 'portfolio' && (
              <div style={{ maxWidth: "100%", width: "100%" }}>
                <div className="profile-portfolio-head">
                  <div>
                    <h2 style={{ fontSize: '1.35rem', marginBottom: '0.35rem', fontWeight: 800 }}>Портфолио</h2>
                    <p style={{ color: 'var(--muted)', marginBottom: 0, fontSize: '0.9rem' }}>
                      Витрина опыта и грамот — часть вашего профиля. После проверки модератором можно скачать с подписью портала.
                    </p>
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={() => goTab('profile', 'overview')}>
                    К профилю
                  </button>
                </div>
                <PortfolioEditor />
              </div>
            )}

            {view === 'settings' && (
              <div className="profile-view svc-settings-page">
                <DashboardSettingsHub
                  profile={profile}
                  profileVisibility={profileVisibility}
                  onlineVisibility={onlineVisibility}
                  profileSaving={profileSaving}
                  setProfileVisibility={setProfileVisibility}
                  setOnlineVisibility={setOnlineVisibility}
                  setProfileSaving={setProfileSaving}
                  setProfile={setProfile}
                  readJsonSafe={readJsonSafe}
                />
              </div>
            )}

            {(view === 'overview' || view === 'edit') && (
              <div className="dashboard-stack" style={{ maxWidth: "100%", width: "100%", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                <div className="profile-overview-top" id="profile-hub">
                  <div className="profile-view profile-view--unified profile-view--modern profile-view--hub">
                    <PersonalQrPanel />
                    <CoworkingCabinetList />
                    <ProfileHeroCard
                      name={legalName || session.user?.name}
                      nickname={profile?.nickname || session.user?.nickname}
                      email={session.user?.email}
                      phone={profile?.phone || session.user?.phone}
                      roleLabel={roleBadge}
                      image={avatarPreview || profile?.image || session.user?.image || null}
                      publicCode={profile?.publicCode}
                      bio={profile?.bio}
                      legend={achievementLegend}
                      modernBadge={modernUserBadge}
                      showcaseStored={profile?.showcaseBadges}
                      showcaseHref="/dashboard/showcase"
                      instructionsVersion={profile?.instructionsVersion}
                      instructionsCompletedAt={profile?.instructionsCompletedAt}
                      authority={
                        profile?.reliabilityPercent == null ? null : profile.reliabilityPercent
                      }
                      authorityLabel={profile?.reliabilityLabel}
                      social={profile?.socialScore ?? 50}
                      ecoPoints={profile?.ecoPoints ?? 0}
                      levelMeta={levelMeta}
                      editSectionHref="#profile-edit"
                      settingsHref="/dashboard/settings"
                      publicHref={
                        profile?.publicCode || session.user?.id
                          ? `/u/${encodeURIComponent(String(profile?.publicCode || session.user?.id))}`
                          : undefined
                      }
                      onEdit={() => {
                        setEditOpen(true);
                      }}
                      onPreview={() => setPreviewOpen(true)}
                      onSettings={() => {
                        setEditOpen(false);
                        router.push('/dashboard/settings');
                      }}
                      onAvatarPick={(file) => {
                        setAvatarFile(file);
                        setAvatarPreview(URL.createObjectURL(file));
                        setAvatarName(file.name);
                        toast('Фото выбрано — сохраните в окне редактирования');
                        setEditOpen(true);
                      }}
                      onShowcaseSaved={(codes) =>
                        setProfile((prev) =>
                          prev ? { ...prev, showcaseBadges: codes } : prev
                        )
                      }
                      onStatClick={(key) => openRepModal(key)}
                      showRatings={modOn('ratings')}
                      showEco={modOn('eco')}
                    />

                  </div>

                  </div>
                {editOpen ? (
                <div className="yp-sheet yp-sheet--profile" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
                  <button type="button" className="yp-sheet__backdrop" aria-label="Закрыть" onClick={() => setEditOpen(false)} />
                  <div className="yp-sheet__panel">
                    <header className="yp-sheet__head">
                      <h2 id="profile-edit-title">Редактировать профиль</h2>
                      <button type="button" className="yp-sheet__close" onClick={() => setEditOpen(false)} aria-label="Закрыть">
                        ×
                      </button>
                    </header>
                <div className="yp-sheet__body">
                <form
                  id="profile-edit"
                  className="profile-unified-edit"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (profileSaving) return;
                    const formEl = e.target as HTMLFormElement;
                    const formData = new FormData(formEl);
                    const nextName = String(formData.get('name') || '').trim();
                    const nextEmail = String(formData.get('email') || '').trim();
                    const nextPhone = String(formData.get('phone') || '').trim();
                    const prevName = String(profile?.name || session.user?.name || '').trim();
                    const prevEmail = String(profile?.email || session.user?.email || '').trim();
                    const prevPhone = String(profile?.phone || session.user?.phone || '').trim();
                    const identityChanged =
                      (nextName && nextName !== prevName) ||
                      (nextEmail && nextEmail.toLowerCase() !== prevEmail.toLowerCase()) ||
                      (nextPhone && nextPhone.replace(/\D/g, '') !== prevPhone.replace(/\D/g, ''));
                    if (identityChanged) {
                      const ok = window.confirm(
                        'Вы меняете имя, почту или телефон. Это можно сделать раз в 30 дней. Сохранить изменения?'
                      );
                      if (!ok) return;
                    }
                    setProfileSaving(true);
                    const data: Record<string, unknown> = Object.fromEntries(formData);
                    data.hobbies = profileHobbies;
                    data.interests = profileInterests;
                    data.birthDate = profileBirthDate || null;
                    data.gender = profileGender || null;
                    data.profileVisibility = profileVisibility;
                    data.onlineVisibility = onlineVisibility;

                    if (avatarFile) {
                      const fileFormData = new FormData();
                      fileFormData.append('file', avatarFile);
                      try {
                        const uploadRes = await fetch('/api/user/upload', {
                          method: 'POST',
                          body: fileFormData,
                        });
                        const uploadData = await uploadRes.json().catch(() => ({}));
                        if (uploadRes.status === 413) {
                          throw new Error('Фото слишком большое для сервера (лимит ~15–25 МБ)');
                        }
                        if (!uploadRes.ok) {
                          throw new Error(uploadData.message || 'Не удалось загрузить фото');
                        }
                        if (uploadData.url) data.image = uploadData.url;
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Ошибка загрузки фото');
                        setProfileSaving(false);
                        return;
                      }
                    }

                    try {
                      data.fingerprint = await collectDeviceFingerprint();
                      const res = await fetch('/api/user/profile', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data),
                      });
                      const json = (await readCabinetJson(res)) || {};
                      if (res.ok) {
                        toast.success(json.message || 'Профиль успешно сохранен!');
                        setEditOpen(false);
                        const saved = json.user || {};
                        setProfile((prev) => ({ ...prev, ...saved }));
                        setProfileHobbies(Array.isArray(saved.hobbies) ? saved.hobbies : profileHobbies);
                        setProfileInterests(Array.isArray(saved.interests) ? saved.interests : profileInterests);
                        if (saved.birthDate) setProfileBirthDate(String(saved.birthDate).slice(0, 10));
                        setProfileGender(
                          saved.gender === 'MALE' || saved.gender === 'FEMALE' ? saved.gender : ''
                        );
                        if (saved.profileVisibility === 'FRIENDS' || saved.profileVisibility === 'PRIVATE') {
                          setProfileVisibility(saved.profileVisibility);
                        } else if (saved.profileVisibility) {
                          setProfileVisibility('PUBLIC');
                        }
                        if (
                          saved.onlineVisibility === 'PUBLIC' ||
                          saved.onlineVisibility === 'HIDDEN' ||
                          saved.onlineVisibility === 'FRIENDS'
                        ) {
                          setOnlineVisibility(saved.onlineVisibility);
                        }
                        setAvatarFile(null);
                        setAvatarName('');
                        if (saved.image) setAvatarPreview(saved.image);
                        await update({
                          name: saved.name || data.name,
                          nickname: saved.nickname ?? data.nickname ?? null,
                          email: saved.email || data.email,
                          phone: saved.phone || data.phone || '',
                          image: saved.image || data.image || session.user?.image,
                          ...(typeof json.keepAlive === 'string' && json.keepAlive
                            ? { keepAlive: json.keepAlive }
                            : {}),
                        });
                        fetch('/api/user/achievements')
                          .then((r) => readCabinetJson(r))
                          .then((d) => {
                            if (d?.progress?.complete || d?.legend) setAchievementLegend(true);
                          })
                          .catch(() => undefined);
                        router.refresh();
                      } else {
                        toast.error(json.message || 'Ошибка при сохранении');
                      }
                    } catch {
                      toast.error('Ошибка сети при сохранении профиля');
                    } finally {
                      setProfileSaving(false);
                    }
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                >
                  <p className="profile-view__lead" style={{ margin: '0 0 0.35rem' }}>
                    Имя, почту и телефон можно менять раз в 30 дней.
                  </p>
                  <details className="profile-edit-fold" open>
                    <summary>Имя, фото, контакты и «о себе»</summary>
                  <div>
                    <span
                      style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Аватар
                    </span>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div
                        style={{
                          width: '72px',
                          height: '72px',
                          borderRadius: '50%',
                          overflow: 'hidden',
                          background: 'linear-gradient(135deg, var(--primary), #60a5fa)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.5rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          border: '2px solid rgba(37,99,235,0.15)',
                        }}
                      >
                        {(avatarPreview || profile?.image || session.user?.image) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatarPreview || profile?.image || session.user?.image || ''}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          session.user?.name?.charAt(0) || <User size={28} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.65rem 1rem',
                            borderRadius: '999px',
                            border: '1px solid rgba(37,99,235,0.25)',
                            background: 'rgba(37,99,235,0.06)',
                            color: 'var(--primary)',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                          }}
                        >
                          <ImagePlus size={16} />
                          Выбрать фото
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              setAvatarFile(file);
                              if (file) {
                                setAvatarPreview(URL.createObjectURL(file));
                                setAvatarName(file.name);
                              } else {
                                setAvatarPreview(null);
                                setAvatarName('');
                              }
                            }}
                          />
                        </label>
                        <p
                          style={{
                            margin: '0.45rem 0 0',
                            fontSize: '0.8rem',
                            color: 'var(--muted)',
                            wordBreak: 'break-all',
                          }}
                        >
                          {avatarName
                            ? avatarName
                            : 'PNG, JPG, WEBP или GIF — до 15 МБ'}
                        </p>
                        {avatarFile && (
                          <button
                            type="button"
                            onClick={() => {
                              setAvatarFile(null);
                              setAvatarPreview(null);
                              setAvatarName('');
                            }}
                            style={{
                              marginTop: '0.35rem',
                              background: 'none',
                              border: 'none',
                              color: '#ef4444',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              padding: 0,
                              fontWeight: 500,
                            }}
                          >
                            Убрать выбранный файл
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                      htmlFor="profile-name"
                    >
                      Имя <span style={{ fontWeight: 400 }}>(раз в 30 дней)</span>
                    </label>
                    <input
                      id="profile-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      key={`name-${profile?.name || session.user?.name || ''}`}
                      defaultValue={profile?.name || session.user?.name || ''}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Никнейм (публичный)
                    </label>
                    <input
                      name="nickname"
                      type="text"
                      key={`nickname-${profile?.nickname || ''}`}
                      defaultValue={profile?.nickname || ''}
                      placeholder="например sochi_leader"
                      maxLength={24}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                      2–24 символа. Показывается вместо имени в профиле. ID:{' '}
                      <strong style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {profile?.publicCode || '…'}
                      </strong>
                    </p>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Город
                    </label>
                    <input
                      name="city"
                      type="text"
                      key={`city-${profile?.city || ''}`}
                      defaultValue={profile?.city || 'Сочи'}
                      placeholder="Сочи"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Дата рождения
                    </label>
                    <input
                      type="date"
                      value={profileBirthDate}
                      onChange={(e) => setProfileBirthDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                    {(profileBirthDate || profile?.zodiac) && (
                      <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>
                        Знак зодиака:{' '}
                        {zodiacFromDate(profileBirthDate) || profile?.zodiac || '—'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Пол
                    </label>
                    <select
                      value={profileGender}
                      onChange={(e) =>
                        setProfileGender(
                          e.target.value === 'MALE' || e.target.value === 'FEMALE'
                            ? e.target.value
                            : ''
                        )
                      }
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                        background: '#fff',
                      }}
                    >
                      <option value="">Не указан</option>
                      <option value="FEMALE">Женский</option>
                      <option value="MALE">Мужской</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Коротко о себе / вайб
                    </label>
                    <input
                      name="bio"
                      type="text"
                      key={`bio-${profile?.bio || ''}`}
                      defaultValue={profile?.bio || ''}
                      maxLength={280}
                      placeholder="Например: на вайбе после квиза 🎧"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      О себе подробнее
                    </label>
                    <textarea
                      name="about"
                      key={`about-${profile?.about || ''}`}
                      defaultValue={profile?.about || ''}
                      rows={4}
                      placeholder="Чем занимаешься, чего хочешь на портале…"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <TagPicker
                    label="Увлечения / хобби"
                    kind="hobbies"
                    value={profileHobbies}
                    onChange={setProfileHobbies}
                    hint="Выберите из списка. Свой вариант — 1 раз в сутки, после проверки модератором"
                  />
                  <TagPicker
                    label="Интересы"
                    kind="interests"
                    value={profileInterests}
                    onChange={setProfileInterests}
                    hint="Тоже можно предложить свой вариант (общий лимит — 1 в сутки)"
                  />
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                      htmlFor="profile-email"
                    >
                      Электронная почта <span style={{ fontWeight: 400 }}>(раз в 30 дней)</span>
                    </label>
                    <input
                      id="profile-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      key={`email-${profile?.email || session.user?.email || ''}`}
                      defaultValue={profile?.email || session.user?.email || ''}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                      htmlFor="profile-phone"
                    >
                      Телефон <span style={{ fontWeight: 400 }}>(раз в 30 дней)</span>
                    </label>
                    <input
                      id="profile-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      key={`phone-${profile?.phone || session.user?.phone || ''}`}
                      defaultValue={profile?.phone || session.user?.phone || ''}
                      placeholder="+7 (900) 000-00-00"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      padding: '0.9rem 1rem',
                      borderRadius: 12,
                      border: '1px solid rgba(15,23,42,0.08)',
                      background: 'rgba(15,23,42,0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Соцсети и Steam (по желанию)</div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Steam
                      </label>
                      <input
                        name="steamUrl"
                        type="url"
                        key={`steam-${profile?.steamUrl || ''}`}
                        defaultValue={profile?.steamUrl || ''}
                        placeholder="https://steamcommunity.com/id/…"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        ВКонтакте
                      </label>
                      <input
                        name="vkUrl"
                        type="text"
                        key={`vk-${profile?.vkUrl || ''}`}
                        defaultValue={profile?.vkUrl || ''}
                        placeholder="https://vk.ru/… или id123"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Telegram
                      </label>
                      <input
                        name="telegramUrl"
                        type="text"
                        key={`tg-${profile?.telegramUrl || ''}`}
                        defaultValue={profile?.telegramUrl || ''}
                        placeholder="@username или https://t.me/…"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div id="messengers" className="profile-messenger-ids" style={{ gridColumn: '1 / -1' }}>
                      <strong style={{ fontSize: '0.88rem' }}>Мессенджеры для ботов</strong>
                      <p className="profile-messenger-ids__hint">
                        Напишите боту /start, затем вставьте сюда свой числовой ID — так портал сможет присылать вам оповещения в MAX и Telegram.
                      </p>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        ID чата Telegram (для бота)
                      </label>
                      <input
                        name="telegramChatId"
                        type="text"
                        inputMode="numeric"
                        key={`tgid-${profile?.telegramChatId || ''}`}
                        defaultValue={profile?.telegramChatId || ''}
                        placeholder="напр. 123456789 — узнать у бота командой /start"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        ID пользователя MAX (для бота)
                      </label>
                      <input
                        name="maxUserId"
                        type="text"
                        inputMode="numeric"
                        key={`maxid-${profile?.maxUserId || ''}`}
                        defaultValue={profile?.maxUserId || ''}
                        placeholder="напр. 13771314 — узнать у бота /start"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        MAX
                      </label>
                      <input
                        name="maxUrl"
                        type="url"
                        key={`max-${profile?.maxUrl || ''}`}
                        defaultValue={profile?.maxUrl || ''}
                        placeholder="https://max.ru/…"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                  <PersonalGalleryEditor />
                  <p className="profile-settings-hub__hint" style={{ margin: '0.5rem 0 0.85rem' }}>
                    Конфиденциальность и смена пароля — во вкладке «Настройки».
                  </p>

                  </details>
                  <div className="profile-edit-sticky">
                    <button
                      type="button"
                      className="profile-edit-sticky__btn profile-edit-sticky__btn--ghost"
                      onClick={() => setEditOpen(false)}
                    >
                      Закрыть
                    </button>
                    <button
                      type="submit"
                      className="profile-edit-sticky__btn profile-edit-sticky__btn--primary"
                      disabled={profileSaving}
                    >
                      {profileSaving ? 'Сохранение…' : 'Сохранить профиль'}
                    </button>
                  </div>
                </form>
                </div>
                  </div>
                </div>
                ) : null}

              </div>
            )}
          </div>
        </div>
      </motion.div>
      <ProfilePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        name={profile?.nickname || legalName || session.user?.name}
        image={avatarPreview || profile?.image || session.user?.image || null}
        bio={profile?.bio}
        hobbies={profileHobbies}
        interests={profileInterests}
        publicCode={profile?.publicCode}
        publicHref={
          profile?.publicCode || session.user?.id
            ? `/u/${encodeURIComponent(String(profile?.publicCode || session.user?.id))}`
            : undefined
        }
        portfolioHref={modOn('portfolio') ? '/dashboard/portfolio' : undefined}
      />
      <ReputationHistoryModal
        open={repModalOpen}
        initialTab={repModalTab}
        onClose={() => setRepModalOpen(false)}
        onEcoChange={setEcoBalance}
        onOpenShop={() => {
          router.push('/dashboard/shop');
          setTimeout(() => {
            document.getElementById('eco-shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }}
      />
    </div>
  );
}


async function readJsonSafe(res: Response) {
  return readCabinetJson(res);
}

export default function DashboardClient({ view = 'overview' }: DashboardClientProps) {
  return <DashboardInner view={view} />;
}
