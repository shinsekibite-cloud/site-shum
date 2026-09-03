'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Flame } from 'lucide-react';
import { getWeeklyChallenge } from '@/lib/weekly-challenge';

type Props = {
  attendedCount?: number;
  participationsCount?: number;
  applicationsCount?: number;
  hasBio?: boolean;
  profileComplete?: boolean;
  checkInsApprox?: number;
  onOpenEdit?: () => void;
  onOpenAchievements?: () => void;
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function checkInKey(day: string) {
  return `yp-checkin-${day}`;
}

function readStreak(): number {
  if (typeof window === 'undefined') return 0;
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 60; i++) {
    const key = checkInKey(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
    if (localStorage.getItem(key) !== '1') break;
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/**
 * Weekly challenge + simple daily check-in (streak).
 * No mood picker — purpose is clear: come back each day / complete the week task.
 */
export default function YouthPulse({
  attendedCount = 0,
  participationsCount = 0,
  applicationsCount = 0,
  hasBio = false,
  profileComplete = false,
  checkInsApprox = 0,
  onOpenEdit,
  onOpenAchievements,
}: Props) {
  const challenge = useMemo(() => getWeeklyChallenge(), []);
  const [checkedIn, setCheckedIn] = useState(false);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const key = checkInKey(todayKey());
    setCheckedIn(localStorage.getItem(key) === '1');
    setStreak(readStreak());
  }, []);

  const progressValue = (() => {
    switch (challenge.metric) {
      case 'attended':
        return Math.min(attendedCount, challenge.target);
      case 'participations':
        return Math.min(participationsCount, challenge.target);
      case 'applications':
        return Math.min(applicationsCount, challenge.target);
      case 'bio':
        return hasBio ? 1 : 0;
      case 'profile':
        return profileComplete ? 1 : 0;
      case 'checkins':
        return Math.min(checkInsApprox, challenge.target);
      default:
        return 0;
    }
  })();
  const done = progressValue >= challenge.target;
  const pct = Math.round((progressValue / challenge.target) * 100);

  const doCheckIn = () => {
    const key = checkInKey(todayKey());
    localStorage.setItem(key, '1');
    setCheckedIn(true);
    setStreak(readStreak());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div
        style={{
          padding: '1rem 1.1rem',
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(14,165,233,0.1), rgba(234,88,12,0.08) 55%, #fff)',
          border: '1px solid rgba(14,165,233,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.95rem' }}>
            <span style={{ fontSize: '1.25rem' }}>{challenge.emoji}</span>
            Задание недели
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)' }}>
            нед. {challenge.week}
          </span>
        </div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>{challenge.title}</div>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.45 }}>
          {challenge.hint}
        </p>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: 'rgba(15,23,42,0.08)',
            overflow: 'hidden',
            marginBottom: 8,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, pct)}%`,
              borderRadius: 999,
              background: done
                ? 'linear-gradient(90deg, #16a34a, #22c55e)'
                : 'linear-gradient(90deg, #0ea5e9, #f97316)',
              transition: 'width 0.35s ease',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: done ? '#15803d' : 'var(--muted)' }}>
            {done ? 'Готово' : `${progressValue} / ${challenge.target}`}
          </span>
          {!done && (
            <button
              type="button"
              onClick={() => {
                if (challenge.metric === 'bio' || challenge.metric === 'profile') onOpenEdit?.();
                else onOpenAchievements?.();
              }}
              style={{
                border: 'none',
                background: 'rgba(15,23,42,0.9)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.75rem',
                padding: '0.35rem 0.7rem',
                borderRadius: 999,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Как сделать
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          padding: '1rem 1.1rem',
          borderRadius: 16,
          border: '1px solid rgba(15,23,42,0.08)',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.95rem' }}>
            <Flame size={16} color="#ea580c" />
            Серия дней
          </div>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>
            Заходи на портал каждый день и отмечайся — серия показывает, насколько ты в деле.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          {streak > 0 && (
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 800,
                color: '#ea580c',
                background: 'rgba(234,88,12,0.1)',
                padding: '0.4rem 0.65rem',
                borderRadius: 10,
              }}
            >
              {streak} дн.
            </span>
          )}
          <button
            type="button"
            onClick={doCheckIn}
            disabled={checkedIn}
            style={{
              border: checkedIn ? '1px solid rgba(22,163,74,0.35)' : 'none',
              background: checkedIn ? 'rgba(22,163,74,0.1)' : 'rgba(15,23,42,0.9)',
              color: checkedIn ? '#15803d' : '#fff',
              fontWeight: 700,
              fontSize: '0.82rem',
              padding: '0.55rem 0.85rem',
              borderRadius: 12,
              cursor: checkedIn ? 'default' : 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {checkedIn ? (
              <>
                <Check size={15} strokeWidth={3} /> Сегодня есть
              </>
            ) : (
              'Отметиться'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
