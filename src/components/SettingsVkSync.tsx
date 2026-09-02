'use client';

import { useMemo, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, Clock, KeyRound, ToggleLeft } from 'lucide-react';
import {
  HOUR_PRESETS,
  WEEKDAY_PRESETS,
  describeVkSyncSchedule,
  parseVkSyncSchedule,
  type VkSyncSchedule,
} from '@/lib/vk-sync-schedule';

type Props = {
  lastSync: string | null;
  syncEnabled: boolean;
  hasToken: boolean;
  groupId: string | null;
  scheduleJson: string | null;
};

export default function SettingsVkSync({
  lastSync,
  syncEnabled,
  hasToken,
  groupId,
  scheduleJson,
}: Props) {
  const initial = useMemo(() => parseVkSyncSchedule(scheduleJson), [scheduleJson]);
  const [hours, setHours] = useState<number[]>(initial.hours);
  const [weekdays, setWeekdays] = useState(initial.weekdays);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const schedule: VkSyncSchedule = { hours, weekdays };
  const blockers: string[] = [];
  if (!syncEnabled) blockers.push('Автоимпорт выключен — включите переключатель выше и сохраните.');
  if (!hasToken) blockers.push('Нет сервисного ключа VK — укажите токен и сохраните.');
  if (!groupId) blockers.push('Не указана группа VK.');

  const toggleHour = (h: number) => {
    setHours((prev) => {
      const next = prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h];
      return next.sort((a, b) => a - b);
    });
  };

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/vk-sync', { method: 'POST' });
      const data = await res.json();
      setResult({
        ok: res.ok,
        message: data.message || (res.ok ? 'Синхронизация выполнена!' : 'Ошибка синхронизации'),
      });
    } catch {
      setResult({ ok: false, message: 'Ошибка сети' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '16px',
        padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.03)',
        border: '1.5px dashed #e2e8f0',
        marginTop: '1.5rem',
      }}
    >
      <h3
        style={{
          margin: '0 0 0.5rem',
          fontSize: '1rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <RefreshCw size={18} style={{ color: '#0077FF' }} /> Синхронизация и расписание
      </h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
        Cron на сервере вызывает API каждый час. Реальный запуск — только в выбранные часы (МСК) и дни.
        «Синхронизировать сейчас» игнорирует расписание. Фото скачиваются локально, видео ВК встраиваются
        плеером.
      </p>

      <div
        style={{
          display: 'grid',
          gap: '0.45rem',
          marginBottom: '1rem',
          fontSize: '0.83rem',
          color: '#334155',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <ToggleLeft size={15} /> Автоимпорт:{' '}
          <strong style={{ color: syncEnabled ? '#166534' : '#b91c1c' }}>
            {syncEnabled ? 'включён' : 'выключен'}
          </strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <KeyRound size={15} /> Токен:{' '}
          <strong style={{ color: hasToken ? '#166534' : '#b91c1c' }}>
            {hasToken ? 'задан' : 'пусто'}
          </strong>
          {groupId ? (
            <>
              {' · '}группа <code>{groupId}</code>
            </>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Clock size={15} /> Расписание: <strong>{describeVkSyncSchedule(schedule)}</strong>
        </div>
        {lastSync ? (
          <div>
            Последний успешный запуск:{' '}
            <strong>{new Date(lastSync).toLocaleString('ru-RU')}</strong>
          </div>
        ) : (
          <div style={{ color: '#b45309' }}>Ещё ни разу не синхронизировали с VK API.</div>
        )}
      </div>

      {blockers.length > 0 && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 10,
            fontSize: '0.85rem',
            color: '#9a3412',
            lineHeight: 1.45,
          }}
        >
          <strong>Почему новости не подтягиваются:</strong>
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Schedule fields — submitted with the parent settings form */}
      <input type="hidden" name="vkSyncScheduleJson" value={JSON.stringify(schedule)} />

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.45rem' }}>Дни недели</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {WEEKDAY_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setWeekdays(p.value)}
              className="btn btn-secondary"
              style={{
                padding: '0.35rem 0.7rem',
                fontSize: '0.8rem',
                borderRadius: 999,
                background: weekdays === p.value ? 'var(--primary)' : undefined,
                color: weekdays === p.value ? '#fff' : undefined,
                border: weekdays === p.value ? 'none' : undefined,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          value={weekdays}
          onChange={(e) => setWeekdays(e.target.value)}
          className="settings-input"
          style={{ marginTop: '0.5rem', maxWidth: 220 }}
          placeholder="1-5"
          aria-label="Дни недели cron"
        />
      </div>

      <div style={{ marginBottom: '1.1rem' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.45rem' }}>
          Часы запуска (МСК)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {HOUR_PRESETS.map((h) => {
            const on = hours.includes(h);
            return (
              <button
                key={h}
                type="button"
                onClick={() => toggleHour(h)}
                className="btn btn-secondary"
                style={{
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.8rem',
                  borderRadius: 999,
                  background: on ? 'var(--primary)' : undefined,
                  color: on ? '#fff' : undefined,
                  border: on ? 'none' : undefined,
                }}
              >
                {String(h).padStart(2, '0')}:00
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.45rem 0 0' }}>
          Сохраните настройки формы, чтобы расписание применилось. Cron на сервере — каждый час в :05.
        </p>
      </div>

      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="btn btn-secondary"
        style={{
          borderRadius: '100px',
          padding: '0.65rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          opacity: loading ? 0.7 : 1,
        }}
      >
        <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        {loading ? 'Синхронизация...' : 'Синхронизировать сейчас'}
      </button>

      {result && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: result.ok ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${result.ok ? '#bbf7d0' : '#fecaca'}`,
            borderRadius: '10px',
            fontSize: '0.85rem',
            color: result.ok ? '#166534' : '#b91c1c',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {result.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {result.message}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
