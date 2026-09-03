'use client';

import { useSafeSearchParams } from '@/lib/use-safe-search-params';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Bell,
  ChevronRight,
  KeyRound,
  Link2,
  MessageCircle,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import SessionSecurityPanel from '@/components/SessionSecurityPanel';
import RecoveryPhrasePanel from '@/components/RecoveryPhrasePanel';
import TotpSetupPanel from '@/components/TotpSetupPanel';
import AccountDeletionPanel from '@/components/AccountDeletionPanel';
import NotificationPrefsPanel from '@/components/NotificationPrefsPanel';
import MessengerLinkPanel from '@/components/MessengerLinkPanel';
import { invalidateProfileCache } from '@/lib/user-data-client';

export type SettingsSectionId =
  | 'hub'
  | 'privacy'
  | 'password'
  | 'security'
  | 'devices'
  | '2fa'
  | 'recovery'
  | 'danger'
  | 'consents'
  | 'notifications'
  | 'messengers';

type HubSectionId = Exclude<
  SettingsSectionId,
  'hub' | 'devices' | '2fa' | 'recovery' | 'danger'
>;

type SecuritySubSectionId = 'devices' | '2fa' | 'recovery' | 'danger';

const SECTIONS: {
  id: HubSectionId;
  title: string;
  desc: string;
  icon: typeof ShieldCheck;
}[] = [
  { id: 'privacy', title: 'Публичность', desc: 'Кто видит профиль и «в сети»', icon: UserRound },
  { id: 'password', title: 'Пароль', desc: 'Смена пароля входа', icon: KeyRound },
  { id: 'security', title: 'Безопасность', desc: 'Устройства, 2FA, удаление', icon: ShieldCheck },
  { id: 'consents', title: 'Согласия', desc: 'Политика и cookie', icon: BadgeCheck },
  { id: 'notifications', title: 'Уведомления', desc: 'Почта и пуш', icon: Bell },
  { id: 'messengers', title: 'Мессенджеры', desc: 'Telegram и MAX', icon: MessageCircle },
];

const SECURITY_SUBSECTIONS: {
  id: SecuritySubSectionId;
  title: string;
  desc: string;
  icon: typeof ShieldCheck;
  danger?: boolean;
}[] = [
  { id: 'devices', title: 'Устройства', desc: 'Сеансы, IP и доверенные устройства', icon: MonitorSmartphone },
  { id: '2fa', title: 'Двухфакторная аутентификация', desc: 'Коды из приложения-аутентификатора', icon: Smartphone },
  { id: 'recovery', title: 'Фраза восстановления', desc: '24 слова на случай потери доступа', icon: KeyRound },
  { id: 'danger', title: 'Удаление аккаунта', desc: 'Запрос и отмена удаления', icon: AlertTriangle, danger: true },
];

const SECURITY_SUB_IDS = new Set<string>(SECURITY_SUBSECTIONS.map((s) => s.id));

type ProfileLite = {
  deletionRequestedAt?: string | null;
  deletionEffectiveAt?: string | null;
  privacyFirstAcceptedAt?: string | null;
  privacyAcceptedAt?: string | null;
  privacyPolicyVersion?: string | null;
  privacySignature?: string | null;
  rulesAcceptedAt?: string | null;
  rulesPolicyVersion?: string | null;
  rulesSignature?: string | null;
  cookiesAcceptedAt?: string | null;
  cookiesPolicyVersion?: string | null;
  cookiesSignature?: string | null;
  telegramChatId?: string | null;
  maxUserId?: string | null;
};

type Props = {
  profile: ProfileLite | null;
  profileVisibility: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  onlineVisibility: 'FRIENDS' | 'PUBLIC' | 'HIDDEN';
  profileSaving: boolean;
  setProfileVisibility: (v: 'PUBLIC' | 'FRIENDS' | 'PRIVATE') => void;
  setOnlineVisibility: (v: 'FRIENDS' | 'PUBLIC' | 'HIDDEN') => void;
  setProfileSaving: (v: boolean) => void;
  setProfile: (updater: (prev: any) => any) => void;
  readJsonSafe: (res: Response) => Promise<any>;
  embedded?: boolean;
  onClose?: () => void;
};

function parseSection(raw: string | null): SettingsSectionId {
  const v = String(raw || '').trim().toLowerCase();
  if (SECTIONS.some((s) => s.id === v)) return v as SettingsSectionId;
  if (SECURITY_SUB_IDS.has(v)) return v as SettingsSectionId;
  return 'hub';
}

export default function DashboardSettingsHub({
  profile,
  profileVisibility,
  onlineVisibility,
  profileSaving,
  setProfileVisibility,
  setOnlineVisibility,
  setProfileSaving,
  setProfile,
  readJsonSafe,
  embedded,
  onClose,
}: Props) {
  const router = useRouter();
  const searchParams = useSafeSearchParams();
  const section = parseSection(searchParams.get('section'));
  const isSecuritySub = SECURITY_SUB_IDS.has(section);
  const hubMeta = SECTIONS.find((s) => s.id === section);
  const securityMeta = SECURITY_SUBSECTIONS.find((s) => s.id === section);
  const activeMeta = securityMeta || hubMeta;

  useEffect(() => {
    const bound = searchParams.get('bound');
    if (bound === 'max') {
      toast.success('MAX привязан к аккаунту');
      const next = new URLSearchParams(searchParams.toString());
      next.delete('bound');
      next.delete('reason');
      const q = next.toString();
      router.replace(q ? `/dashboard/settings?${q}` : '/dashboard/settings?section=messengers');
    } else if (bound === 'error') {
      const reason = searchParams.get('reason');
      toast.error(
        reason === 'rate'
          ? 'Слишком много попыток — подождите немного'
          : reason === 'used'
            ? 'Ссылка уже использована'
            : reason === 'expired'
              ? 'Ссылка устарела'
              : reason
                ? decodeURIComponent(reason)
                : 'Не удалось привязать MAX'
      );
      const next = new URLSearchParams(searchParams.toString());
      next.delete('bound');
      next.delete('reason');
      const q = next.toString();
      router.replace(q ? `/dashboard/settings?${q}` : '/dashboard/settings?section=messengers');
    }
  }, [searchParams, router]);

  const go = (next: SettingsSectionId) => {
    if (next === 'hub') {
      router.push('/dashboard/settings');
      return;
    }
    router.push(`/dashboard/settings?section=${next}`);
  };

  if (section === 'hub') {
    return (
      <div className={`profile-view profile-settings-hub profile-settings-hub--split${embedded ? ' profile-settings-hub--embedded' : ''}`}>
        {embedded ? (
          <p className="profile-view__lead settings-hub-embedded-lead">
            Профиль, безопасность, уведомления, мессенджеры и публичность — откройте нужный раздел.
          </p>
        ) : (
          <header className="settings-hub-head">
            <Link href="/dashboard" className="settings-back">
              <ArrowLeft size={16} aria-hidden /> К профилю
            </Link>
            <h2 className="profile-view__title">Настройки</h2>
            <p className="profile-view__lead">Каждый блок открывается отдельно — без длинной простыни.</p>
          </header>
        )}

        <nav className="settings-hub-list" aria-label="Разделы настроек">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className="settings-hub-item" onClick={() => go(s.id)}>
              <span className="settings-hub-item__icon" aria-hidden>
                <s.icon size={18} />
              </span>
              <span className="settings-hub-item__text">
                <strong>{s.title}</strong>
                <small>{s.desc}</small>
              </span>
              <ChevronRight size={18} className="settings-hub-item__chev" aria-hidden />
            </button>
          ))}
        </nav>

        <p className="settings-hub-foot">
          Данные профиля (имя, фото, ник) — в{' '}
          {embedded && onClose ? (
            <button
              type="button"
              className="settings-hub-foot__link"
              onClick={() => {
                onClose();
                if (typeof window !== 'undefined') window.location.hash = 'profile-edit';
              }}
            >
              данных профиля
            </button>
          ) : (
            <Link href="/dashboard#profile-edit">данных профиля</Link>
          )}
          .
        </p>
      </div>
    );
  }

  const backTarget: SettingsSectionId = isSecuritySub ? 'security' : 'hub';
  const backLabel = isSecuritySub ? 'Безопасность' : 'Все настройки';

  return (
    <div className={`profile-view profile-settings-hub profile-settings-hub--section${embedded ? ' profile-settings-hub--embedded' : ''}`}>
      <header className="settings-hub-head">
        <button type="button" className="settings-back" onClick={() => go(backTarget)}>
          <ArrowLeft size={16} aria-hidden /> {backLabel}
        </button>
        <h2 className="profile-view__title">{activeMeta?.title || 'Настройки'}</h2>
        {activeMeta?.desc ? <p className="profile-view__lead">{activeMeta.desc}</p> : null}
      </header>

      {section === 'privacy' ? (
        <section className="profile-section" aria-label="Конфиденциальность">
          <p className="profile-settings-hub__hint">
            Открытый — в поиске друзей. «Только друзья» и «Закрытый» скрывают имя и аватар за псевдонимом.
          </p>
          <div className="profile-choice-grid">
            {(
              [
                { id: 'PUBLIC' as const, title: 'Открытый', desc: 'Виден всем, есть в поиске' },
                { id: 'FRIENDS' as const, title: 'Только друзья', desc: 'Псевдоним для чужих' },
                { id: 'PRIVATE' as const, title: 'Закрытый', desc: 'Скрыт из поиска, друзья по ссылке' },
              ] as const
            ).map((opt) => (
              <label key={opt.id} className={`profile-choice${profileVisibility === opt.id ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="profileVisibilitySettings"
                  checked={profileVisibility === opt.id}
                  onChange={() => setProfileVisibility(opt.id)}
                />
                <span>
                  <strong>{opt.title}</strong>
                  <span>{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="profile-section__title" style={{ margin: '1rem 0 0.45rem' }}>
            Статус «в сети»
          </div>
          <div className="profile-choice-grid">
            {(
              [
                { id: 'FRIENDS' as const, title: 'Только друзья', desc: 'По умолчанию' },
                { id: 'PUBLIC' as const, title: 'Всем', desc: 'Авторизованным' },
                { id: 'HIDDEN' as const, title: 'Скрыт', desc: 'Никому' },
              ] as const
            ).map((opt) => (
              <label key={opt.id} className={`profile-choice${onlineVisibility === opt.id ? ' is-on-green' : ''}`}>
                <input
                  type="radio"
                  name="onlineVisibilitySettings"
                  checked={onlineVisibility === opt.id}
                  onChange={() => setOnlineVisibility(opt.id)}
                />
                <span>
                  <strong>{opt.title}</strong>
                  <span>{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '0.85rem' }}
            disabled={profileSaving}
            onClick={async () => {
              setProfileSaving(true);
              try {
                const res = await fetch('/api/user/profile', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ profileVisibility, onlineVisibility }),
                });
                const json = (await readJsonSafe(res)) || {};
                if (!res.ok) throw new Error(json.message || 'Не удалось сохранить');
                invalidateProfileCache();
                setProfile((prev) => ({ ...prev, ...json.user }));
                toast.success('Сохранено');
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Ошибка сохранения');
              } finally {
                setProfileSaving(false);
              }
            }}
          >
            Сохранить
          </button>
        </section>
      ) : null}

      {section === 'password' ? (
        <section className="profile-section" aria-label="Пароль">
          <p className="profile-settings-hub__hint">Минимум 10 символов, буквы и цифры.</p>
          <form
            className="profile-password-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const currentPassword = String(fd.get('currentPassword') || '');
              const password = String(fd.get('password') || '');
              if (password.length < 10 || !/[A-Za-zА-Яа-я]/.test(password) || !/\d/.test(password)) {
                toast.error('Пароль: минимум 10 символов, буквы и цифры');
                return;
              }
              setProfileSaving(true);
              try {
                const res = await fetch('/api/user/profile', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ currentPassword, password }),
                });
                const json = (await readJsonSafe(res)) || {};
                if (!res.ok) throw new Error(json.message || 'Не удалось сменить пароль');
                toast.success('Пароль обновлён');
                e.currentTarget.reset();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Ошибка');
              } finally {
                setProfileSaving(false);
              }
            }}
          >
            <label className="yp-field">
              <span>Текущий пароль</span>
              <input name="currentPassword" type="password" autoComplete="current-password" required />
            </label>
            <label className="yp-field">
              <span>Новый пароль</span>
              <input name="password" type="password" autoComplete="new-password" minLength={10} required />
            </label>
            <button type="submit" className="btn btn-primary" disabled={profileSaving}>
              Обновить пароль
            </button>
          </form>
        </section>
      ) : null}

      {section === 'security' ? (
        <section className="profile-section settings-security-hub" aria-label="Безопасность">
          {profile?.deletionRequestedAt ? (
            <div className="settings-warn settings-warn--compact">
              <strong>Удаление аккаунта запланировано</strong>
              <p>
                До{' '}
                {profile.deletionEffectiveAt
                  ? new Date(profile.deletionEffectiveAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
                  : 'указанной даты'}{' '}
                (МСК) можно отменить в разделе «Удаление аккаунта».
              </p>
            </div>
          ) : null}
          <nav className="settings-hub-list" aria-label="Разделы безопасности">
            {SECURITY_SUBSECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`settings-hub-item${s.danger ? ' settings-hub-item--danger' : ''}`}
                onClick={() => go(s.id)}
              >
                <span className="settings-hub-item__icon" aria-hidden>
                  <s.icon size={18} />
                </span>
                <span className="settings-hub-item__text">
                  <strong>{s.title}</strong>
                  <small>{s.desc}</small>
                </span>
                <ChevronRight size={18} className="settings-hub-item__chev" aria-hidden />
              </button>
            ))}
          </nav>
        </section>
      ) : null}

      {section === 'devices' ? (
        <section className="profile-section settings-security-panel" aria-label="Устройства">
          <SessionSecurityPanel compact />
        </section>
      ) : null}

      {section === '2fa' ? (
        <section className="profile-section settings-security-panel" aria-label="2FA">
          <TotpSetupPanel compact />
        </section>
      ) : null}

      {section === 'recovery' ? (
        <section className="profile-section settings-security-panel" aria-label="Фраза восстановления">
          <RecoveryPhrasePanel compact />
        </section>
      ) : null}

      {section === 'danger' ? (
        <section className="profile-section settings-security-panel" aria-label="Удаление аккаунта">
          {profile?.deletionRequestedAt ? (
            <div className="settings-warn settings-warn--compact">
              <strong>Удаление аккаунта запланировано</strong>
              <p>
                До{' '}
                {profile.deletionEffectiveAt
                  ? new Date(profile.deletionEffectiveAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
                  : 'указанной даты'}{' '}
                (МСК) можно отменить ниже.
              </p>
            </div>
          ) : null}
          <AccountDeletionPanel compact />
        </section>
      ) : null}

      {section === 'consents' ? (
        <section className="profile-section" aria-label="Согласия">
          <div className="profile-consent-list">
            {(
              [
                {
                  key: 'privacy-first',
                  label: 'Первое согласие с политикой',
                  href: '/privacy',
                  at: profile?.privacyFirstAcceptedAt || profile?.privacyAcceptedAt,
                  version: undefined as string | null | undefined,
                  signature: undefined as string | null | undefined,
                },
                {
                  key: 'privacy',
                  label: 'Политика конфиденциальности',
                  href: '/privacy',
                  at: profile?.privacyAcceptedAt,
                  version: profile?.privacyPolicyVersion,
                  signature: profile?.privacySignature,
                },
                {
                  key: 'rules',
                  label: 'Правила сайта',
                  href: '/rules',
                  at: profile?.rulesAcceptedAt,
                  version: profile?.rulesPolicyVersion,
                  signature: profile?.rulesSignature,
                },
                {
                  key: 'cookies',
                  label: 'Cookie и уведомления',
                  href: '/privacy',
                  at: profile?.cookiesAcceptedAt,
                  version: profile?.cookiesPolicyVersion,
                  signature: profile?.cookiesSignature,
                },
              ] as const
            ).map((row) => (
              <div key={row.key} className={`profile-consent${row.at ? ' is-ok' : ''}`}>
                <BadgeCheck size={15} style={{ marginTop: 2, color: row.at ? '#15803d' : '#94a3b8', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <a href={row.href}>{row.label}</a>
                  <div className="profile-consent__meta">
                    {row.at
                      ? `Принято ${new Date(row.at).toLocaleString('ru-RU', {
                          timeZone: 'Europe/Moscow',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })} (МСК)${row.version ? ` · v${row.version}` : ''}`
                      : 'Ещё не зафиксировано'}
                  </div>
                  {row.signature ? (
                    <div className="profile-consent__sig" title={row.signature}>
                      Подпись: {row.signature.slice(0, 28)}…
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: '0.75rem' }}
            onClick={() => {
              void import('@/lib/cookie-consent').then((m) => m.openCookieSettings());
            }}
          >
            Настройки cookie
          </button>
        </section>
      ) : null}

      {section === 'notifications' ? <NotificationPrefsPanel /> : null}

      {section === 'messengers' ? (
        <MessengerLinkPanel
          telegramChatId={profile?.telegramChatId}
          maxUserId={profile?.maxUserId}
          onSaved={(patch) => setProfile((prev) => (prev ? { ...prev, ...patch } : prev))}
        />
      ) : null}

      {section === 'messengers' ? (
        <p className="settings-hub-foot" style={{ marginTop: '1rem' }}>
          <Link2 size={14} aria-hidden /> Ссылки на соцсети также можно указать в{' '}
          <Link href="/dashboard#profile-edit">данных профиля</Link>.
        </p>
      ) : null}
    </div>
  );
}
