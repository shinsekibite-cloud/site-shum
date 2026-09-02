'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Clock, ArrowLeft } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  workingHourOptions,
  isWithinWorkingHours,
  moscowWallDate,
  getTzYmd,
  calendarCellYmd,
  formatMskTimeRange,
  bookingsConflictWithTurnover,
  BOOKING_TURNOVER_MINUTES,
} from '@/lib/booking-hours';
import {
  EVENT_CATEGORIES,
  type EventCategory,
  type EventContactMode,
} from '@/lib/event-meta';

interface Booking {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  status: string;
  user: { name: string };
  participantsCount: number;
  joinedByMe: boolean;
}

interface BookingCalendarProps {
  spaceId: string;
  spaceCapacity?: number;
  openTime?: string;
  closeTime?: string;
  minBookingHours?: number;
  /** Prefill from hall occupancy slot (ISO). */
  initialStartIso?: string | null;
  initialEndIso?: string | null;
}

type ProfileContacts = {
  phone?: string | null;
  vkUrl?: string | null;
  telegramUrl?: string | null;
  maxUrl?: string | null;
  publicCode?: string | null;
};

function defaultBookingTimes(openTime: string, closeTime: string): { start: string; end: string } {
  const options = workingHourOptions(openTime, closeTime);
  if (options.length === 0) {
    return { start: openTime, end: closeTime };
  }
  const start = options[0];
  // Prefer +2h (4 × 30-min steps); fall back to next available or last option
  const plusTwoIdx = Math.min(4, options.length - 1);
  let end = options[plusTwoIdx] || options[options.length - 1];
  if (end === start && options.length > 1) {
    end = options[1];
  }
  return { start, end };
}

function hhmmFromIso(iso: string | null | undefined, fallback: string) {
  if (!iso) return fallback;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return fallback;
  }
}

function dateFromIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(iso));
    const y = Number(parts.find((p) => p.type === 'year')?.value);
    const m = Number(parts.find((p) => p.type === 'month')?.value);
    const d = Number(parts.find((p) => p.type === 'day')?.value);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  } catch {
    return null;
  }
}

export default function BookingCalendar({
  spaceId,
  spaceCapacity = 50,
  openTime = '09:00',
  closeTime = '21:00',
  minBookingHours = 3,
  initialStartIso = null,
  initialEndIso = null,
}: BookingCalendarProps) {
  const { data: session } = useSession();
  const router = useRouter();

  const timeOptions = workingHourOptions(openTime, closeTime);
  const initialTimes = defaultBookingTimes(openTime, closeTime);
  const prefillDate = dateFromIso(initialStartIso);

  const [currentDate, setCurrentDate] = useState(prefillDate || new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(prefillDate);

  const [startTime, setStartTime] = useState(hhmmFromIso(initialStartIso, initialTimes.start));
  const [endTime, setEndTime] = useState(hhmmFromIso(initialEndIso, initialTimes.end));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('Общее');
  const [contactMode, setContactMode] = useState<EventContactMode>('PROFILE');
  const [showOrganizerProfile, setShowOrganizerProfile] = useState(true);
  const [contactPhone, setContactPhone] = useState('');
  const [contactTelegram, setContactTelegram] = useState('');
  const [contactVk, setContactVk] = useState('');
  const [contactMax, setContactMax] = useState('');
  const [profileContacts, setProfileContacts] = useState<ProfileContacts | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [existingBookings, setExistingBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (initialStartIso) {
      const d = dateFromIso(initialStartIso);
      if (d) {
        setCurrentDate(d);
        setSelectedDate(d);
      }
      setStartTime(hhmmFromIso(initialStartIso, initialTimes.start));
      setEndTime(hhmmFromIso(initialEndIso, initialTimes.end));
      return;
    }
    const next = defaultBookingTimes(openTime, closeTime);
    setStartTime(next.start);
    setEndTime(next.end);
  }, [openTime, closeTime, initialStartIso, initialEndIso]);

  useEffect(() => {
    fetch(`/api/spaces/${spaceId}/bookings`)
      .then(res => res.json())
      .then(data => setExistingBookings(Array.isArray(data) ? data : []))
      .catch(err => console.error("Ошибка загрузки расписания:", err));
  }, [spaceId]);

  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/user/profile')
      .then((r) => r.json())
      .then((d) => {
        const u = d.user || d;
        setProfileContacts({
          phone: u.phone || null,
          vkUrl: u.vkUrl || null,
          telegramUrl: u.telegramUrl || null,
          maxUrl: u.maxUrl || null,
          publicCode: u.publicCode || null,
        });
      })
      .catch(() => undefined);
  }, [session?.user]);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const startingDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const handleDateClick = (day: number) => {
    if (isDatePast(day)) return;
    const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(clickedDate);
    setMessage(null); // clear messages when picking new date
  };

  const isDatePast = (day: number) => {
    const cell = calendarCellYmd(currentDate.getFullYear(), currentDate.getMonth(), day);
    return cell < getTzYmd(new Date());
  };

  const handleJoinEvent = async (eventId: string) => {
    if (!session) {
      router.push('/login?callbackUrl=' + encodeURIComponent(window.location.pathname));
      return;
    }
    if (session.user?.moderationPending) {
      setMessage({
        type: 'error',
        text: 'Аккаунт на проверке — запись на событие пока недоступна.',
      });
      return;
    }

    try {
      const res = await fetch(`/api/bookings/${eventId}/join`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setExistingBookings(prev => prev.map(booking => {
          if (booking.id === eventId) {
             return {
               ...booking,
               joinedByMe: Boolean(data.joined),
               participantsCount: Math.max(0, booking.participantsCount + (data.joined ? 1 : -1)),
             };
          }
          return booking;
        }));
        setMessage({ type: 'success', text: data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Ошибка при присоединении' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) {
      const cb = `${window.location.pathname}${window.location.search || ''}`;
      router.push('/login?callbackUrl=' + encodeURIComponent(cb));
      return;
    }
    if (session.user?.moderationPending) {
      setMessage({
        type: 'error',
        text: 'Ваш аккаунт на проверке. Бронь будет доступна после одобрения администратором.',
      });
      return;
    }

    if (!selectedDate || !title.trim() || title.trim().length < 3) {
      setMessage({ type: 'error', text: 'Укажите понятное название (минимум 3 символа)' });
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      setMessage({ type: 'error', text: 'Опишите, для чего мероприятие (минимум 10 символов)' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const y = selectedDate.getFullYear();
      const mo = selectedDate.getMonth();
      const d = selectedDate.getDate();
      // Wall clock in Sochi/Moscow — avoids UTC skew on the VPS
      const startDateTime = moscowWallDate(y, mo, d, startTime);
      const endDateTime = moscowWallDate(y, mo, d, endTime);

      const now = new Date();
      if (startDateTime <= now) {
        setMessage({ type: 'error', text: 'Нельзя забронировать на прошедшее время.' });
        setIsSubmitting(false);
        return;
      }

      const minTime = new Date(now.getTime() + minBookingHours * 60 * 60 * 1000);
      if (startDateTime < minTime) {
        setMessage({ type: 'error', text: `Бронирование возможно не менее чем за ${minBookingHours} ч. до начала.` });
        setIsSubmitting(false);
        return;
      }

      if (startDateTime >= endDateTime) {
        setMessage({ type: 'error', text: 'Время окончания должно быть позже' });
        setIsSubmitting(false);
        return;
      }

      const hoursCheck = isWithinWorkingHours(startDateTime, endDateTime, openTime, closeTime);
      if (!hoursCheck.ok) {
        setMessage({ type: 'error', text: hoursCheck.message || 'Вне рабочего времени' });
        setIsSubmitting(false);
        return;
      }

      const hasOverlap = existingBookings.some((booking) => {
        if (booking.status !== 'APPROVED' && booking.status !== 'PENDING') return false;
        const bStart = new Date(booking.startTime);
        const bEnd = new Date(booking.endTime);
        return bookingsConflictWithTurnover(bStart, bEnd, startDateTime, endDateTime);
      });

      if (hasOverlap) {
        setMessage({
          type: 'error',
          text: `Время пересекается с другой бронью или ближе ${BOOKING_TURNOVER_MINUTES} мин. (после 10:00–11:00 — с 11:10).`,
        });
        setIsSubmitting(false);
        return;
      }

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spaceId,
          title: title.trim(),
          description: description.trim(),
          category,
          contactMode,
          showOrganizerProfile,
          contactPhone: contactMode === 'CUSTOM' ? contactPhone.trim() : undefined,
          contactTelegram: contactMode === 'CUSTOM' ? contactTelegram.trim() : undefined,
          contactVk: contactMode === 'CUSTOM' ? contactVk.trim() : undefined,
          contactMax: contactMode === 'CUSTOM' ? contactMax.trim() : undefined,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: 'Заявка отправлена!' });
        const { reachGoal } = await import('@/components/YandexMetrika');
        reachGoal('booking');
        setTitle('');
        setDescription('');
        setCategory('Общее');
        setContactMode('PROFILE');
        setShowOrganizerProfile(true);
        setContactPhone('');
        setContactTelegram('');
        setContactVk('');
        setContactMax('');
        setSelectedDate(null);
        // Reload bookings
        const freshRes = await fetch(`/api/spaces/${spaceId}/bookings`);
        const freshData = await freshRes.json();
        setExistingBookings(freshData);
      } else {
        setMessage({ type: 'error', text: data.message || 'Ошибка' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Ошибка сети. Попробуйте позже.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.4rem',
    border: '1px solid #e2e8f0',
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
    fontSize: '0.9rem',
    backgroundColor: 'white',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {message && (
        <div style={{ padding: '0.75rem', margin: '1rem 1rem 0', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', backgroundColor: message.type === 'success' ? '#f0fdf4' : '#fef2f2', color: message.type === 'success' ? '#15803d' : '#b91c1c' }}>
          {message.text}
        </div>
      )}

      {/* View 1: Calendar Grid (Shown when no date is selected) */}
      {!selectedDate && (
        <div className="booking-calendar-shell" style={{ padding: '1rem', backgroundColor: '#fafafa', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <button type="button" onClick={handlePrevMonth} style={{ padding: '0.25rem', borderRadius: '50%', background: 'transparent' }} className="hover-bg-muted">
              <ChevronLeft size={20} />
            </button>
            <h4 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--foreground)' }}>
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h4>
            <button type="button" onClick={handleNextMonth} style={{ padding: '0.25rem', borderRadius: '50%', background: 'transparent' }} className="hover-bg-muted">
              <ChevronRight size={20} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.2rem', textAlign: 'center', marginBottom: '0.5rem', maxWidth: '100%' }}>
            {dayNames.map(day => (
              <div key={day} style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', padding: '0.25rem 0' }}>{day}</div>
            ))}

            {Array.from({ length: startingDay }).map((_, i) => (
              <div key={`empty-${i}`} style={{ padding: '0.25rem' }}></div>
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isPast = isDatePast(day);

              const cellYmd = calendarCellYmd(currentDate.getFullYear(), currentDate.getMonth(), day);
              const hasBookings = existingBookings.some((b) => getTzYmd(new Date(b.startTime)) === cellYmd);

              let btnStyle: React.CSSProperties = {
                width: '2rem', height: '2rem', margin: '0 auto', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', transition: 'all 0.2s', border: 'none', fontWeight: 500
              };

              if (isPast) {
                btnStyle = { ...btnStyle, color: '#cbd5e1', cursor: 'not-allowed', backgroundColor: 'transparent' };
              } else {
                btnStyle = { ...btnStyle, color: 'var(--foreground)', backgroundColor: 'transparent', cursor: 'pointer' };
              }

              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => handleDateClick(day)}
                  disabled={isPast}
                  style={btnStyle}
                  onMouseOver={e => { if (!isPast) e.currentTarget.style.backgroundColor = 'rgba(244, 63, 94, 0.1)'; }}
                  onMouseOut={e => { if (!isPast) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {day}
                    {hasBookings && !isPast && (
                      <div style={{ position: 'absolute', bottom: '2px', width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--accent)' }} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* View 2: Form & Events (Shown when a date is selected) */}
      {selectedDate && (
        <div style={{ padding: '1rem', backgroundColor: '#ffffff' }}>

          <button
            type="button"
            onClick={() => setSelectedDate(null)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--muted)', fontSize: '0.85rem', fontWeight: 600, background: 'transparent', border: 'none', padding: 0, marginBottom: '1rem', cursor: 'pointer' }}
          >
            <ArrowLeft size={14} /> Назад к календарю
          </button>

          <h4 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--foreground)' }}>
            {selectedDate.getDate()} {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
          </h4>

          {(() => {
            const selectedYmd = calendarCellYmd(
              selectedDate.getFullYear(),
              selectedDate.getMonth(),
              selectedDate.getDate()
            );
            const selectedDateEvents = existingBookings.filter(
              (b) => getTzYmd(new Date(b.startTime)) === selectedYmd
            );

            return (
              <>
                {selectedDateEvents.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h5 style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Уже запланировано:</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {selectedDateEvents.map(event => {
                        const isJoined = Boolean(event.joinedByMe);
                        const participantsCount = event.participantsCount || 0;
                        const availableSeats = spaceCapacity - participantsCount;
                        const isFull = availableSeats <= 0;

                        return (
                        <div key={event.id} style={{ padding: '0.75rem', border: '1px solid rgba(244, 63, 94, 0.2)', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(244, 63, 94, 0.02)' }}>
                          <h6 style={{ fontWeight: 600, fontSize: '0.95rem', margin: '0 0 0.25rem 0' }}>{event.title}</h6>

                          <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                            {formatMskTimeRange(event.startTime, event.endTime)} (МСК)
                          </div>

                          {event.status === 'APPROVED' && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: isFull ? '#991b1b' : '#166534' }}>
                                {isFull ? 'Мест нет' : 'Есть места'}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleJoinEvent(event.id)}
                                disabled={!isJoined && isFull}
                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: isJoined ? '#cbd5e1' : 'var(--accent)', color: isJoined ? '#333' : 'white', cursor: (!isJoined && isFull) ? 'not-allowed' : 'pointer', opacity: (!isJoined && isFull) ? 0.5 : 1 }}
                              >
                                {isJoined ? 'Отменить' : isFull ? 'Мест нет' : 'Я пойду'}
                              </button>
                            </div>
                          )}
                        </div>
                      )})}
                    </div>
                    <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid rgba(0,0,0,0.08)' }} />
                  </div>
                )}
              </>
            );
          })()}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.25rem' }}>Название мероприятия *</label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={120}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Напр. Мастер-класс по вокалу"
                style={{ width: '100%', padding: '0.4rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.25rem' }}>Для чего / анонс *</label>
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Кратко: кто приходит, что будет происходить, нужна ли регистрация"
                style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.9rem', resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.25rem' }}>Категория</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EventCategory)}
                style={selectStyle}
              >
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
                  <Clock size={12} /> Начало
                </label>
                <select
                  required
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  style={selectStyle}
                >
                  {timeOptions.map(t => (
                    <option key={`start-${t}`} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
                  <Clock size={12} /> Конец
                </label>
                <select
                  required
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  style={selectStyle}
                >
                  {timeOptions.map(t => (
                    <option key={`end-${t}`} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>
              Рабочее время: {openTime}–{closeTime} (время Сочи)
            </p>

            <div className="svc-form-group" role="group" aria-labelledby="bk-org-label">
              <span id="bk-org-label" className="svc-form-group__label">Организатор в афише</span>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.82rem', marginBottom: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showOrganizerProfile}
                  onChange={(e) => setShowOrganizerProfile(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  Показывать мой профиль на сайте
                  {profileContacts?.publicCode ? (
                    <span style={{ color: 'var(--muted)' }}> ({profileContacts.publicCode})</span>
                  ) : null}
                </span>
              </label>

              <div style={{ fontSize: '0.78rem', fontWeight: 650, marginBottom: 6 }}>Контакты для записи</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {(
                  [
                    { id: 'PROFILE' as const, label: 'Из моего профиля', hint: 'VK / Telegram / MAX / телефон' },
                    { id: 'CUSTOM' as const, label: 'Указать свои', hint: 'Только для этой брони' },
                    { id: 'HIDDEN' as const, label: 'Не показывать', hint: 'Только площадка и время' },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.id}
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'flex-start',
                      padding: '0.4rem 0.5rem',
                      borderRadius: 8,
                      border: contactMode === opt.id ? '1px solid rgba(13,115,119,0.45)' : '1px solid var(--line)',
                      background: contactMode === opt.id ? 'var(--brand-soft)' : '#fff',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                    }}
                  >
                    <input
                      type="radio"
                      name="contactMode"
                      checked={contactMode === opt.id}
                      onChange={() => setContactMode(opt.id)}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <strong style={{ display: 'block' }}>{opt.label}</strong>
                      <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              {contactMode === 'PROFILE' && profileContacts ? (
                <p style={{ margin: '0.55rem 0 0', fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                  Сейчас в профиле:{' '}
                  {[
                    profileContacts.phone && `тел. ${profileContacts.phone}`,
                    profileContacts.telegramUrl && 'Telegram',
                    profileContacts.vkUrl && 'VK',
                    profileContacts.maxUrl && 'MAX',
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'контакты не заполнены — добавьте в кабинете'}
                </p>
              ) : null}

              {contactMode === 'CUSTOM' ? (
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  <input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="Телефон"
                    style={{ width: '100%', padding: '0.4rem 0.65rem', border: '1px solid var(--line)', borderRadius: 8, fontSize: '0.85rem' }}
                  />
                  <input
                    value={contactTelegram}
                    onChange={(e) => setContactTelegram(e.target.value)}
                    placeholder="Telegram (@user или ссылка)"
                    style={{ width: '100%', padding: '0.4rem 0.65rem', border: '1px solid var(--line)', borderRadius: 8, fontSize: '0.85rem' }}
                  />
                  <input
                    value={contactVk}
                    onChange={(e) => setContactVk(e.target.value)}
                    placeholder="VK (ссылка)"
                    style={{ width: '100%', padding: '0.4rem 0.65rem', border: '1px solid var(--line)', borderRadius: 8, fontSize: '0.85rem' }}
                  />
                  <input
                    value={contactMax}
                    onChange={(e) => setContactMax(e.target.value)}
                    placeholder="MAX (ссылка)"
                    style={{ width: '100%', padding: '0.4rem 0.65rem', border: '1px solid var(--line)', borderRadius: 8, fontSize: '0.85rem' }}
                  />
                </div>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || Boolean(session?.user?.moderationPending)}
              style={{ width: '100%', padding: '0.6rem', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--accent)', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', marginTop: '0.25rem' }}
            >
              {session?.user?.moderationPending
                ? 'Аккаунт на проверке'
                : isSubmitting
                  ? 'Отправка...'
                  : 'Отправить заявку'}
            </button>
            {session?.user?.moderationPending ? (
              <p style={{ margin: '0.45rem 0 0', fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center' }}>
                Бронь откроется после одобрения администратором.
              </p>
            ) : null}
          </form>
        </div>
      )}
    </div>
  );
}
