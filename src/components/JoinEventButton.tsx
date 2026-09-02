'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { reachGoal } from '@/components/YandexMetrika';
import { ListPlus, UserMinus, UserPlus } from 'lucide-react';
import AddToCalendarButton from '@/components/AddToCalendarButton';

interface JoinEventButtonProps {
  eventId: string;
  initialIsJoined: boolean;
  initialIsFull: boolean;
  initialAvailableSeats: number;
  initialWaitlisted?: boolean;
  title?: string;
  startTime?: string | Date;
  endTime?: string | Date;
  location?: string | null;
  description?: string | null;
  /** Compact row-friendly controls for event cards */
  compact?: boolean;
  /** Icon-only control with tooltip (event card action row) */
  iconOnly?: boolean;
}

export default function JoinEventButton({
  eventId,
  initialIsJoined,
  initialIsFull,
  initialAvailableSeats,
  initialWaitlisted = false,
  title,
  startTime,
  endTime,
  location,
  description,
  compact = false,
  iconOnly = false,
}: JoinEventButtonProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname() || '/';
  const loginHref = `/login?callbackUrl=${encodeURIComponent(pathname)}`;

  const [isJoined, setIsJoined] = useState(initialIsJoined);
  const [isFull, setIsFull] = useState(initialIsFull);
  const [waitlisted, setWaitlisted] = useState(initialWaitlisted);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const callJoin = async (opts?: { waitlist?: boolean }) => {
    if (!session) {
      router.push('/login?callbackUrl=' + encodeURIComponent(window.location.pathname));
      return;
    }
    if (session.user?.moderationPending) {
      setMessage(
        'Ваш аккаунт находится на проверке. Полный функционал будет доступен после одобрения администратором'
      );
      return;
    }

    const joining = !isJoined && !waitlisted && !opts?.waitlist;
    const waitlisting = !isJoined && !waitlisted && Boolean(opts?.waitlist);
    const leaving = isJoined || waitlisted;

    // Optimistic UI — don't wait on slow email side-effects
    if (joining) {
      setIsJoined(true);
      setWaitlisted(false);
      setIsFull(initialAvailableSeats - 1 <= 0);
    } else if (waitlisting) {
      setWaitlisted(true);
      setIsFull(true);
    } else if (leaving) {
      setIsJoined(false);
      setWaitlisted(false);
      setIsFull(false);
    }

    setIsLoading(true);
    setMessage('');
    try {
      const res = await fetch(`/api/bookings/${eventId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setIsJoined(Boolean(data.joined));
        setWaitlisted(Boolean(data.waitlisted));
        if (data.joined) {
          setIsFull(initialAvailableSeats - 1 <= 0);
          reachGoal('event_join');
        } else if (data.waitlisted) {
          setIsFull(true);
          reachGoal('event_waitlist');
        } else {
          setIsFull(false);
        }
        setMessage(data.message || '');
        // Defer RSC refresh so the button unlocks immediately
        window.setTimeout(() => router.refresh(), 0);
      } else {
        // Roll back optimistic state
        setIsJoined(initialIsJoined);
        setWaitlisted(initialWaitlisted);
        setIsFull(initialIsFull);
        if (data.full) {
          setIsFull(true);
          setMessage(data.message || 'Мест нет');
        } else {
          setMessage(data.message || 'Ошибка');
        }
      }
    } catch (err) {
      console.error(err);
      setIsJoined(initialIsJoined);
      setWaitlisted(initialWaitlisted);
      setIsFull(initialIsFull);
      setMessage('Ошибка сети');
    } finally {
      setIsLoading(false);
    }
  };

  const label = isLoading
    ? 'Загрузка...'
    : isJoined
      ? 'Вы записаны'
      : waitlisted
        ? 'В листе ожидания'
        : isFull
          ? 'В лист ожидания'
          : 'Я пойду';

  const actionLabel = isLoading
    ? 'Загрузка...'
    : isJoined
      ? 'Отменить участие'
      : waitlisted
        ? 'Покинуть лист ожидания'
        : isFull
          ? 'В лист ожидания'
          : 'Я пойду';

  const showCalendar = isJoined && title && startTime && endTime;
  const pad = compact ? '0.4rem 0.55rem' : '0.75rem';
  const fontSize = compact ? '0.78rem' : '0.9rem';
  if (iconOnly) {
    const needsLogin = !session && !isJoined && !waitlisted;
    const pendingMod = Boolean(session?.user?.moderationPending);
    const iconTitle = pendingMod
      ? 'Аккаунт на проверке'
      : needsLogin
      ? 'Войти'
      : isJoined
        ? 'Отменить участие'
        : waitlisted
          ? 'Покинуть лист ожидания'
          : isFull
            ? 'В лист ожидания'
            : 'Записаться на мероприятие';
    const Icon = isJoined || waitlisted ? UserMinus : isFull ? ListPlus : UserPlus;
    return (
      <button
        type="button"
        onClick={() =>
          needsLogin
            ? router.push(loginHref)
            : callJoin(isJoined || waitlisted ? undefined : isFull ? { waitlist: true } : undefined)
        }
        disabled={isLoading || pendingMod}
        className={`event-action-icon join-event-icon${isJoined ? ' is-joined' : ''}${waitlisted ? ' is-waitlist' : ''}`}
        title={iconTitle}
        aria-label={iconTitle}
        style={{ opacity: isLoading || pendingMod ? 0.7 : 1 }}
      >
        <Icon size={16} aria-hidden />
      </button>
    );
  }

  return (
    <div className={`join-event${compact ? ' is-compact' : ''}`}>
      {isJoined || waitlisted ? (
        <>
          {!compact ? (
            <div
              className="join-event-status"
              style={{
                backgroundColor: isJoined ? '#e2e8f0' : '#fef3c7',
                color: isJoined ? '#334155' : '#92400e',
                padding: pad,
                fontSize,
              }}
            >
              {label}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => callJoin()}
            disabled={isLoading}
            className="join-event-btn is-ghost"
            style={{
              padding: compact ? '0.4rem 0.55rem' : '0.55rem',
              fontSize: compact ? '0.75rem' : '0.8rem',
              opacity: isLoading ? 0.7 : 1,
            }}
            title={compact ? label : undefined}
          >
            {compact ? (isJoined ? 'Отменить' : 'Покинуть') : actionLabel}
          </button>
        </>
      ) : !session ? (
        <Link
          href={loginHref}
          className="join-event-btn is-primary"
          style={{ padding: pad, fontSize, textAlign: 'center', textDecoration: 'none' }}
        >
          Войти
        </Link>
      ) : session.user?.moderationPending ? (
        <div className="join-event-msg" style={{ padding: pad, fontSize }}>
          Аккаунт на проверке
        </div>
      ) : (
        <button
          type="button"
          onClick={() => callJoin(isFull ? { waitlist: true } : undefined)}
          disabled={isLoading}
          className={`join-event-btn${isFull ? ' is-waitlist' : ' is-primary'}`}
          style={{ padding: pad, fontSize, opacity: isLoading ? 0.7 : 1 }}
        >
          {compact ? (isFull ? 'В лист ожидания' : 'Я пойду') : actionLabel}
        </button>
      )}
      {message && <div className="join-event-msg">{message}</div>}
      {showCalendar && !compact && (
        <AddToCalendarButton
          uid={eventId}
          title={title}
          description={description}
          location={location}
          start={startTime}
          end={endTime}
          compact
        />
      )}
    </div>
  );
}
