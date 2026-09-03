'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  Download,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Trophy,
  Settings,
} from 'lucide-react';
import { formatMskDateTime } from '@/lib/booking-hours';
import { safetyCategoryLabel } from '@/lib/censor';
import { MODERATION_NOTE_PRESETS } from '@/lib/moderation-config';
import ProfileTagsModerationPanel from '@/components/admin/ProfileTagsModerationPanel';

type FlagRow = {
  id: string;
  category: string;
  categories: string[];
  severity: number;
  status: string;
  sourceType?: string;
  originalText: string;
  maskedText: string;
  matches: string[];
  reliabilityDelta: number;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  actor: {
    id: string;
    name: string | null;
    email: string | null;
    publicCode: string | null;
    warnCount: number;
    reliabilityScore: number | null;
  };
};

type HallRow = {
  userId: string;
  rank: number;
  name: string;
  publicCode: string | null;
  image: string | null;
  total: number;
  actioned: number;
  dismissed: number;
  reviewed: number;
};

type Stats = {
  openCount: number;
  openChatCount?: number;
  openPhotoCount?: number;
  totalPeriod: number;
  days: number;
  byCategory: { category: string; label: string; count: number }[];
  topActors: {
    userId: string;
    count: number;
    name: string;
    publicCode: string | null;
    warnCount: number;
  }[];
  hallOfFame: HallRow[];
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'На проверке',
  REVIEWED: 'Просмотрено',
  ACTIONED: 'Есть решение',
  DISMISSED: 'Снято',
  ALL: 'Все',
};

const SOURCE_LABEL: Record<string, string> = {
  DIRECT_MESSAGE: 'Переписка',
  MESSAGE: 'Сообщение',
  GROUP_CHAT: 'Чат клуба',
  GALLERY_IMAGE: 'Фото галереи',
  AVATAR_IMAGE: 'Аватар',
  PROFILE_TEXT: 'Текст профиля',
};

export default function AdminModerationPage() {
  const [status, setStatus] = useState('OPEN');
  const [source, setSource] = useState<'all' | 'chat' | 'photo' | 'profile'>('all');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [days, setDays] = useState(30);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        status,
        days: String(days),
        source,
      });
      if (category) params.set('category', category);
      if (q) params.set('q', q);
      const res = await fetch(`/api/admin/moderation?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Не удалось загрузить');
      setFlags(data.flags || []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [status, days, source, category, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (id: string, action: 'REVIEWED' | 'DISMISSED' | 'ACTIONED') => {
    setBusyId(id);
    try {
      const note = (notes[id] || '').trim() || null;
      if (action === 'ACTIONED' && !note) {
        setExpandedId(id);
        setError('Добавьте комментарий пользователю — иначе непонятно, на что ответ модератора.');
        setBusyId(null);
        return;
      }
      const res = await fetch('/api/admin/moderation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      setNotes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setExpandedId(null);
      setError('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="moderation-page">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center' }}>
            <ShieldAlert size={22} /> Модерация
          </h1>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
            Переписки, фото профиля/галереи и текст «о себе». Открытые флаги — это очередь на проверку, не «непонятные уведомления».
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link
            className="btn btn-secondary"
            href="/admin/settings?tab=moderation"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Settings size={16} /> Настройки
          </Link>
          <a
            className="btn btn-secondary"
            href={`/api/admin/moderation?status=ALL&days=${days}&format=csv`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={16} /> Отчёт CSV
          </a>
          <a
            className="btn btn-secondary"
            href={`/api/admin/moderation?days=${days}&format=reviewers-csv`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Trophy size={16} /> Модераторы
          </a>
          <button type="button" className="btn btn-secondary" onClick={() => void load()} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <RefreshCw size={16} /> Обновить
          </button>
        </div>
      </div>

      <ProfileTagsModerationPanel />

      {stats ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div className="glass" style={{ padding: '0.9rem 1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700 }}>Всего на проверке</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{stats.openCount}</div>
          </div>
          <div className="glass" style={{ padding: '0.9rem 1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700 }}>Переписки</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{stats.openChatCount ?? '—'}</div>
          </div>
          <div className="glass" style={{ padding: '0.9rem 1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700 }}>Фото</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{stats.openPhotoCount ?? '—'}</div>
          </div>
          <div className="glass" style={{ padding: '0.9rem 1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700 }}>За {stats.days} дн.</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{stats.totalPeriod}</div>
          </div>
          {stats.byCategory.slice(0, 3).map((c) => (
            <button
              key={c.category}
              type="button"
              className="glass"
              onClick={() => setCategory((cur) => (cur === c.category ? '' : c.category))}
              style={{
                padding: '0.9rem 1rem',
                textAlign: 'left',
                cursor: 'pointer',
                border: category === c.category ? '2px solid var(--primary)' : undefined,
              }}
              title="Фильтр по категории"
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700 }}>{c.label}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{c.count}</div>
            </button>
          ))}
        </div>
      ) : null}

      {stats?.hallOfFame?.length ? (
        <div className="glass" style={{ padding: '0.9rem 1rem', marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={18} color="#ca8a04" /> Доска почёта модераторов
            <span style={{ fontWeight: 600, color: 'var(--muted)', fontSize: '0.8rem' }}>за {stats.days} дн.</span>
          </div>
          <div className="mod-hof-grid">
            {stats.hallOfFame.map((r) => (
              <div key={r.userId} className="mod-hof-card">
                <span className="mod-hof-rank">#{r.rank}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{r.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {r.total} разборов · действие {r.actioned} · снято {r.dismissed}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {stats?.topActors?.length ? (
        <div className="glass" style={{ padding: '0.9rem 1rem', marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Частые нарушители</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {stats.topActors.map((a) => (
              <Link
                key={a.userId}
                href={`/admin/users/${a.userId}`}
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 650,
                  padding: '0.35rem 0.65rem',
                  borderRadius: 999,
                  background: 'rgba(185,28,28,0.08)',
                  color: '#991b1b',
                  textDecoration: 'none',
                  maxWidth: '100%',
                  overflowWrap: 'anywhere',
                }}
              >
                {a.name} · {a.count} · предупр. {a.warnCount}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {(
          [
            ['all', 'Все типы'],
            ['chat', `Переписки${stats?.openChatCount != null ? ` (${stats.openChatCount})` : ''}`],
            ['photo', `Фото${stats?.openPhotoCount != null ? ` (${stats.openPhotoCount})` : ''}`],
            ['profile', 'Профиль'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSource(key)}
            className={source === key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        {(['OPEN', 'REVIEWED', 'ACTIONED', 'DISMISSED', 'ALL'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={status === s ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}
          >
            {STATUS_LABEL[s] || s}
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qDraft.trim());
          }}
          style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}
        >
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Поиск: имя, код, фрагмент…"
            style={{
              minWidth: 200,
              padding: '0.4rem 0.65rem',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: '0.85rem',
            }}
          />
          <button type="submit" className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}>
            Найти
          </button>
          {q || category ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}
              onClick={() => {
                setQ('');
                setQDraft('');
                setCategory('');
              }}
            >
              Сбросить
            </button>
          ) : null}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid #e2e8f0' }}
          >
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
          </select>
        </form>
      </div>

      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
      {loading ? <p style={{ color: 'var(--muted)' }}>Загрузка…</p> : null}

      {!loading && flags.length === 0 ? (
        <div className="glass" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
          Флагов нет — всё чисто за выбранный период.
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {flags.map((f) => {
          const showForm = f.status === 'OPEN' && (expandedId === f.id || Boolean(notes[f.id]));
          return (
            <article key={f.id} className="glass" style={{ padding: '1rem', maxWidth: '100%', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, overflowWrap: 'anywhere' }}>
                    {safetyCategoryLabel(f.category)}
                    <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 650 }}>
                      {SOURCE_LABEL[f.sourceType || ''] || f.sourceType || 'Контент'}
                      {' · '}
                      уровень {f.severity}/3
                      {f.reliabilityDelta ? ` · рейтинг ${f.reliabilityDelta}` : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2, overflowWrap: 'anywhere' }}>
                    <Link href={`/admin/users/${f.actor.id}`} style={{ color: 'var(--primary)', fontWeight: 650 }}>
                      {f.actor.name || 'Пользователь'}
                    </Link>
                    {f.actor.publicCode ? ` · ${f.actor.publicCode}` : ''}
                    {' · '}предупр. {f.actor.warnCount}
                    {' · '}надёжность {f.actor.reliabilityScore ?? '—'}%
                    {' · '}
                    {formatMskDateTime(f.createdAt)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 750,
                    padding: '0.2rem 0.55rem',
                    borderRadius: 999,
                    background: f.status === 'OPEN' ? 'rgba(245,158,11,0.15)' : 'rgba(15,23,42,0.06)',
                    color: f.status === 'OPEN' ? '#92400e' : '#475569',
                    height: 'fit-content',
                  }}
                >
                  {STATUS_LABEL[f.status] || f.status}
                </span>
              </div>

              <div
                style={{
                  marginTop: 10,
                  padding: '0.75rem',
                  borderRadius: 12,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  maxWidth: '100%',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
                  {f.sourceType === 'GALLERY_IMAGE' || f.sourceType === 'AVATAR_IMAGE'
                    ? f.sourceType === 'AVATAR_IMAGE'
                      ? 'Аватар на проверке'
                      : 'Фото галереи на проверке'
                    : f.sourceType === 'PROFILE_TEXT'
                      ? 'Текст профиля'
                      : 'Сообщение (контекст для решения)'}
                </div>
                {(f.sourceType === 'GALLERY_IMAGE' || f.sourceType === 'AVATAR_IMAGE') &&
                (f.originalText || '').startsWith('/') ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.originalText}
                      alt="На модерации"
                      style={{
                        maxWidth: '100%',
                        maxHeight: 220,
                        objectFit: 'contain',
                        borderRadius: 10,
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                      }}
                    />
                    <code style={{ fontSize: '0.72rem', overflowWrap: 'anywhere' }}>{f.originalText}</code>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        filter: revealId === f.id ? 'none' : 'blur(3px)',
                        userSelect: revealId === f.id ? 'auto' : 'none',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                      }}
                    >
                      {revealId === f.id ? f.originalText : f.maskedText}
                    </div>
                    <button
                      type="button"
                      onClick={() => setRevealId((cur) => (cur === f.id ? null : f.id))}
                      style={{
                        marginTop: 8,
                        border: 0,
                        background: 'transparent',
                        color: '#1d4ed8',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        gap: 4,
                        alignItems: 'center',
                      }}
                    >
                      <AlertTriangle size={14} />
                      {revealId === f.id ? 'Скрыть оригинал' : 'Показать оригинал админу'}
                    </button>
                  </>
                )}
              </div>

              {f.reviewNote ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: '0.65rem 0.75rem',
                    borderRadius: 10,
                    background: 'rgba(37,99,235,0.06)',
                    border: '1px solid rgba(37,99,235,0.15)',
                    fontSize: '0.85rem',
                    overflowWrap: 'anywhere',
                  }}
                >
                  <strong>Ответ модератора:</strong> {f.reviewNote}
                </div>
              ) : null}

              {f.status === 'OPEN' ? (
                <div style={{ marginTop: 10 }}>
                  {(showForm || expandedId === f.id) && (
                    <div className="mod-note-box">
                      <label htmlFor={`note-${f.id}`} style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)' }}>
                        Комментарий пользователю (обязателен для «Действие»)
                      </label>
                      <textarea
                        id={`note-${f.id}`}
                        value={notes[f.id] || ''}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [f.id]: e.target.value }))}
                        rows={3}
                        maxLength={500}
                        placeholder="Например: повторное нарушение — соблюдайте уважительный тон"
                        style={{
                          width: '100%',
                          marginTop: 6,
                          padding: '0.65rem 0.75rem',
                          borderRadius: 10,
                          border: '1.5px solid #e2e8f0',
                          font: 'inherit',
                          resize: 'vertical',
                          boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {MODERATION_NOTE_PRESETS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem' }}
                            onClick={() => setNotes((prev) => ({ ...prev, [f.id]: p }))}
                          >
                            {p.length > 42 ? `${p.slice(0, 42)}…` : p}
                          </button>
                        ))}
                      </div>
                      <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'var(--muted)' }}>
                        Пользователь увидит: категорию, фрагмент сообщения и ваш ответ — не только короткое «ещё раз».
                      </p>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busyId === f.id}
                      onClick={() => void review(f.id, 'REVIEWED')}
                      style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
                    >
                      <Check size={15} />{' '}
                      {f.sourceType === 'GALLERY_IMAGE' || f.sourceType === 'AVATAR_IMAGE'
                        ? 'Одобрить'
                        : 'Просмотрено'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busyId === f.id}
                      onClick={() => {
                        if (!notes[f.id]?.trim()) {
                          setExpandedId(f.id);
                          setError(
                            f.sourceType === 'GALLERY_IMAGE' || f.sourceType === 'AVATAR_IMAGE'
                              ? 'Укажите причину отклонения фото.'
                              : 'Напишите комментарий — пользователь должен понять, к какому сообщению относится решение.'
                          );
                          return;
                        }
                        void review(f.id, 'ACTIONED');
                      }}
                      style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
                    >
                      <AlertTriangle size={15} />{' '}
                      {f.sourceType === 'GALLERY_IMAGE' || f.sourceType === 'AVATAR_IMAGE'
                        ? 'Отклонить / удалить'
                        : 'Действие / предупредить'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busyId === f.id}
                      onClick={() => void review(f.id, 'DISMISSED')}
                      style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
                    >
                      <X size={15} />{' '}
                      {f.sourceType === 'GALLERY_IMAGE' || f.sourceType === 'AVATAR_IMAGE'
                        ? 'Одобрить и снять'
                        : 'Снять флаг'}
                    </button>
                    {!showForm ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setExpandedId(f.id)}
                        style={{ fontSize: '0.8rem' }}
                      >
                        Комментарий…
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
